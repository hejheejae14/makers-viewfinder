import test from 'node:test';
import assert from 'node:assert/strict';
import { createRestCanceller } from './rest-cancel.ts';
import { createMcpImporter } from './mcp-import.ts';
import { createSyncEngine } from './sync-engine.ts';
import { getFileSources } from './file-registry.ts';
import { handleMcpImport } from './mcp-import-handler.ts';

class MemoryStore {
  data=new Map();locks=new Map();writes=[];
  async get(k){return structuredClone(this.data.get(k));}
  async set(k,v){this.writes.push(['set',k]);this.data.set(k,structuredClone(v));}
  async del(k){this.writes.push(['del',k]);this.data.delete(k);}
  async acquireLock(k,o){if(this.locks.has(k))return false;this.locks.set(k,o);return true;}
  async releaseLock(k,o){if(this.locks.get(k)===o)this.locks.delete(k);}
}
const date='2026-11-22T00:00:00Z';
const file='Hbwppk3hFZm1jq7GuclyXG';
const frame=id=>({id,fileKey:file,teamPage:'앱',name:'홈',texts:['아직 인기글이 없어요'],components:[],tokens:[],figmaUrl:`https://www.figma.com/design/${file}/?node-id=${id.replace(':','-')}`,syncedAt:date});
const idx=(screens=[frame('1:1')])=>({team:'앱',syncedAt:date,screens,excluded:[]});
function setup({job=true,draft=false}={}){
  const store=new MemoryStore();let tick=Date.parse(date);
  const operation=idx([frame('1:1'),frame('2:1')]);
  store.data.set('viewfinder:index:앱',operation);
  const sources=getFileSources('앱').slice(0,2),id='fixture-job-123';
  const restJob={id,startedAt:date,next:1,files:sources.map(source=>({source,next:0,status:{sourceId:source.sourceId,fileKey:source.fileKey,fileName:source.name,status:'pending',screens:0}})),mds:{components:[],styles:[]}};
  const stages=sources.map(s=>`viewfinder:multi-stage:${id}:${s.sourceId}`),base=`viewfinder:multi-base:${id}`;
  if(job){store.data.set('viewfinder:multi-job:앱',restJob);store.data.set(base,idx());for(const k of stages)store.data.set(k,{screens:[frame('3:1')],excluded:[]});}
  if(draft)store.data.set('viewfinder:multi-draft:앱',idx([frame('4:1')]));
  const protectedData=new Map([
    ['viewfinder:index:플그',{sentinel:'플그 운영'}],['viewfinder:multi-job:플그',{sentinel:'플그 작업'}],
    ['viewfinder:multi-stage:OTHER-JOB:OTHER-SOURCE',{sentinel:'다른 작업 결과'}],['viewfinder:multi-base:OTHER-JOB',{sentinel:'다른 기준'}],
    ['viewfinder:figma-cooldown:앱',9999999999999],['viewfinder:figma-token',{token:'SYNTHETIC_NEVER_LOG'}],
    ['viewfinder:multi-backup:앱:OLD',{sentinel:'기존 백업'}],['viewfinder:mcp-import:draft:앱',{sentinel:'기존 MCP 초안'}],
  ]);
  for(const [k,v]of protectedData)store.data.set(k,structuredClone(v));
  return {store,operation,protectedData,stages,base,restJob,api:createRestCanceller(store,()=>tick),advance:()=>tick+=16*60_000};
}

for(const [label,options]of [['작업만',{job:true}],['초안만',{job:false,draft:true}],['작업과 초안',{job:true,draft:true}]]){
  test(`${label}: 검토 후 전체 대상 백업·확인 뒤 취소하며 운영·타 팀·토큰·cooldown·기존 백업 보존`,async()=>{
    const {store,api,operation,protectedData}=setup(options);const before=new Map(structuredClone([...store.data]));
    const review=await api.review('앱');assert.equal(review.existingScreens,2);assert.equal(review.canCancel,true);
    assert.deepEqual(await store.get('viewfinder:index:앱'),operation);assert.equal(store.writes.filter(([op])=>op==='del').length,0);
    assert.equal(!!review.job,!!options.job);assert.equal(review.draftScreens!==undefined,!!options.draft);
    if(options.job){assert.equal(review.job.done,1);assert.equal(review.job.total,2);assert.equal(review.job.files.length,2);}
    const result=await api.cancel('앱',review.id),backup=await store.get(result.backup);
    for(const entry of backup.snapshot.entries){assert.deepEqual(entry.value,before.get(entry.key)??null);if(entry.value!==null)assert.equal(await store.get(entry.key),undefined);}
    assert.deepEqual(await store.get('viewfinder:index:앱'),operation);
    for(const[k,v]of protectedData)assert.deepEqual(await store.get(k),v);
    assert.ok(store.writes.findIndex(([op,k])=>op==='set'&&k===result.backup)<store.writes.findIndex(([op])=>op==='del'));
    assert.equal(store.locks.size,0);assert.equal(await store.get('viewfinder:rest-cancel:active:앱'),undefined);
    assert.equal((await api.review('앱')).canCancel,false);
  });
}

test('대상이 없으면 반영을 거부하며 백업·삭제·운영 쓰기 없음',async()=>{
  const {api,store}=setup({job:false});const r=await api.review('앱');assert.equal(r.canCancel,false);assert.deepEqual(r.targets,[]);
  await assert.rejects(()=>api.cancel('앱',r.id));assert.ok(!store.writes.some(([op,k])=>op==='del'||k.includes(':backup:')||k.startsWith('viewfinder:index:')));
});

test('검토 뒤 작업 진행·초안·stage·운영 변경은 모두 취소 차단',async()=>{
  for(const change of ['job','draft','stage','operation']){
    const {api,store,stages}=setup({job:true,draft:true});const r=await api.review('앱');
    if(change==='job'){const j=await store.get('viewfinder:multi-job:앱');j.next=2;store.data.set('viewfinder:multi-job:앱',j);}
    if(change==='draft')store.data.set('viewfinder:multi-draft:앱',idx([frame('5:1')]));
    if(change==='stage')store.data.set(stages[0],{screens:[],excluded:[]});
    if(change==='operation')store.data.get('viewfinder:index:앱').screens.reverse();
    const before=structuredClone([...store.data]);await assert.rejects(()=>api.cancel('앱',r.id),/변경/);
    assert.deepEqual([...store.data],before);assert.equal(store.writes.filter(([op])=>op==='del').length,0);
  }
});

test('잠금 충돌·검토 만료·다른 검토 ID는 백업·취소하지 않는다',async()=>{
  const {api,store,advance}=setup();const r=await api.review('앱');store.locks.set('viewfinder:multi-lock:앱','busy');
  await assert.rejects(()=>api.cancel('앱',r.id),/작업 중/);await assert.rejects(()=>api.review('앱'),/작업 중/);
  store.locks.clear();await assert.rejects(()=>api.cancel('앱','wrong'));advance();await assert.rejects(()=>api.cancel('앱',r.id),/만료/);
  assert.ok(!store.writes.some(([op])=>op==='del'));
});

test('백업 저장 실패·백업 read-back 불일치는 대상 보존 및 잠금 해제',async()=>{
  for(const failure of ['set','verify']){
    const {api,store}=setup();const r=await api.review('앱');const before=await store.get('viewfinder:multi-job:앱');const set=store.set.bind(store);
    store.set=async(k,v)=>{if(k.includes('rest-cancel:backup:')){if(failure==='set')throw Error('가짜 저장 실패');return set(k,{...v,fingerprint:'invalid'});}return set(k,v);};
    await assert.rejects(()=>api.cancel('앱',r.id));assert.deepEqual(await store.get('viewfinder:multi-job:앱'),before);
    assert.ok(!store.writes.some(([op])=>op==='del'));assert.equal(store.locks.size,0);
  }
});

test('정리 도중 실패하면 백업 재사용·같은 검토 재시도로 완료, REST 재개와 MCP 우회 금지',async()=>{
  const {api,store,operation}=setup({job:true,draft:true});const r=await api.review('앱');const del=store.del.bind(store);let failed=false;
  store.del=async k=>{if(k.startsWith('viewfinder:multi-base:')&&!failed){failed=true;throw Error('가짜 정리 실패');}return del(k);};
  await assert.rejects(()=>api.cancel('앱',r.id));assert.ok(await store.get('viewfinder:rest-cancel:active:앱'));
  const importer=createMcpImporter(store);await assert.rejects(()=>importer.review('앱',idx([frame('14330:42211')])),/취소 정리/);
  const rest=createSyncEngine({store,get:async()=>assert.fail('Figma 호출 금지'),loadMds:async()=>assert.fail('Figma 호출 금지')});
  await assert.rejects(()=>rest.runSyncStep('앱','FAKE'),/취소 정리/);await assert.rejects(()=>rest.planSync('앱','FAKE'),/취소 정리/);
  const resume=await api.review('앱');assert.equal(resume.id,r.id);assert.equal(resume.resuming,true);
  const result=await api.cancel('앱',resume.id);assert.equal(result.cancelled,true);assert.deepEqual(await store.get('viewfinder:index:앱'),operation);
  assert.equal(store.writes.filter(([op,k])=>op==='set'&&k===result.backup).length,1);
  const importReview=await importer.review('앱',idx([frame('14330:42211')]));assert.equal(importReview.canPublish,true);
  assert.deepEqual(await store.get('viewfinder:index:앱'),operation); // 취소·검토는 MCP 화면 자동 반영이 아니다.
});

test('삭제는 성공했지만 응답 실패한 경우와 마지막 active 삭제 실패도 재시도 가능',async()=>{
  for(const failKey of ['viewfinder:multi-job:앱','viewfinder:rest-cancel:active:앱']){
    const {api,store,operation}=setup();const r=await api.review('앱');const del=store.del.bind(store);let failed=false;
    store.del=async k=>{await del(k);if(k===failKey&&!failed){failed=true;throw Error('응답 손실');}};
    await assert.rejects(()=>api.cancel('앱',r.id));const result=await api.cancel('앱',r.id);assert.equal(result.cancelled,true);
    assert.deepEqual(await store.get('viewfinder:index:앱'),operation);
    store.data.set('viewfinder:multi-job:앱',{id:'NEW-JOB'});await api.cancel('앱',r.id);
    assert.deepEqual(await store.get('viewfinder:multi-job:앱'),{id:'NEW-JOB'});
  }
});

test('부분 정리 후 대상이 변경되면 새 데이터는 삭제하지 않는다',async()=>{
  const {api,store,stages}=setup();const r=await api.review('앱');const del=store.del.bind(store);let failed=false;
  store.del=async k=>{if(k===stages[0]&&!failed){failed=true;throw Error('실패');}return del(k);};
  await assert.rejects(()=>api.cancel('앱',r.id));store.data.set(stages[0],{screens:['변경 데이터']});
  await assert.rejects(()=>api.cancel('앱',r.id),/변경/);assert.deepEqual(await store.get(stages[0]),{screens:['변경 데이터']});
});

test('취소 직전 만료돼도 active 생성 이후에는 정리를 재개할 수 있다',async()=>{
  const {api,store,advance}=setup();const r=await api.review('앱');const del=store.del.bind(store);let failed=false;
  store.del=async k=>{if(!failed){failed=true;throw Error('실패');}return del(k);};
  await assert.rejects(()=>api.cancel('앱',r.id));advance();const resume=await api.review('앱');assert.equal(resume.resuming,true);
  assert.equal((await api.cancel('앱',r.id)).cancelled,true);
});

test('등록 팀과 파일 범위를 벗어난 작업은 키를 구성하거나 취소하지 않는다',async()=>{
  for(const field of ['source','jobId']){
    const {api,store}=setup();const job=await store.get('viewfinder:multi-job:앱');
    if(field==='source')job.files[0].source={...job.files[0].source,team:'플그'};else job.id='../../other';
    store.data.set('viewfinder:multi-job:앱',job);await assert.rejects(()=>api.review('앱'),/팀·파일/);assert.equal(store.writes.length,0);
  }
});

test('같은 관리자 API에서 인증·명시적 확인 없이 상태·백업·취소 불가',async()=>{
  const old=[process.env.TEAM_PASSWORD,process.env.MCP_IMPORT_ADMIN_PASSWORD];const teamPass='FIXTURE_TEAM',admin='FIXTURE_ADMIN_123456789';
  process.env.TEAM_PASSWORD=teamPass;process.env.MCP_IMPORT_ADMIN_PASSWORD=admin;
  const request=(body,headers={})=>new Request('https://example.test/api/admin/mcp-import',{method:'POST',headers:{'content-type':'application/json','x-team-password':teamPass,'x-mcp-admin-password':admin,...headers},body:JSON.stringify(body)});
  try{
    for(const action of ['cancel-review','cancel-rest']){
      assert.equal((await handleMcpImport(request({team:'앱',action},{'x-mcp-admin-password':'WRONG'}),()=>assert.fail('저장소 금지'))).status,401);
      assert.equal((await handleMcpImport(request({team:'앱',action},{'x-team-password':'WRONG'}),()=>assert.fail('저장소 금지'))).status,401);
    }
    const {store}=setup();const call=r=>handleMcpImport(r,()=>store);
    const response=await call(request({team:'앱',action:'cancel-review'}));assert.equal(response.status,200);const r=await response.json();
    assert.ok(!JSON.stringify(r).includes('SYNTHETIC_NEVER_LOG'));
    assert.equal((await call(request({team:'앱',action:'cancel-rest',id:r.id}))).status,400);
    assert.equal((await call(request({team:'앱',action:'cancel-rest',id:r.id,confirmed:true}))).status,200);
  }finally{for(const[i,k]of ['TEAM_PASSWORD','MCP_IMPORT_ADMIN_PASSWORD'].entries())if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}
});
