import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createMcpImporter } from './mcp-import.ts';
import { validateMcpImport } from './mcp-import-validation.ts';
import { handleMcpImport, MAX_IMPORT_BYTES } from './mcp-import-handler.ts';
import { createSyncEngine } from './sync-engine.ts';
import { getEvidence } from '../2-1-search/evidence.ts';
import { getFileSources } from './file-registry.ts';

// 저장소는 메모리에서만 동작한다. fetch/Redis/Figma/Gemini 요청은 하지 않는다.
class MemoryStore {
  data = new Map(); locks = new Map(); writes = [];
  async get(k) { return structuredClone(this.data.get(k)); }
  async set(k,v) { this.writes.push(k); this.data.set(k,structuredClone(v)); }
  async del(k) { this.writes.push(k); this.data.delete(k); }
  async acquireLock(k,o) { if(this.locks.has(k)) return false; this.locks.set(k,o); return true; }
  async releaseLock(k,o) { if(this.locks.get(k)===o) this.locks.delete(k); }
}
const file='Hbwppk3hFZm1jq7GuclyXG', other='6ztRwsGgpR9goEO5gByDeI', date='2026-11-22T13:19:54.571Z';
const screen=(id='14330:42211', key=file, team='앱')=>({id,fileKey:key,teamPage:team,name:'홈',texts:['홈','아직 인기글이 없어요','아직 최신글이 없어요'],components:[],tokens:[],figmaUrl:`https://www.figma.com/design/${key}/?node-id=${id.replace(':','-')}`,syncedAt:date});
const index=(screens,team='앱')=>({team,syncedAt:date,screens,excluded:[]});
function setup(base=index([screen('1:1')])) {
  const store=new MemoryStore(); if(base)store.data.set('viewfinder:index:앱',structuredClone(base));
  let now=Date.parse(date);return {store,api:createMcpImporter(store,()=>now),advance:()=>now+=16*60_000};
}

test('검토는 운영을 바꾸지 않고 추가 병합은 기존 데이터·순서·파일 상태·타 팀을 보존한다',async()=>{
  const base={...index([screen('1:1'),screen('2:1')]),excluded:[{id:'0:1',name:'메모',reason:'화면 아님'}],files:[{sourceId:file,fileKey:file,fileName:'APP',status:'review',screens:2}]};
  const {store,api}=setup(base); store.data.set('viewfinder:index:플그',index([screen('1:1','croueQo0peccyM6SJabMQw','플그')],'플그'));
  const before=await store.get('viewfinder:index:플그');const incoming=screen();const review=await api.review('앱',index([incoming]));
  assert.deepEqual(await store.get('viewfinder:index:앱'),base);assert.equal(review.existing,2);assert.equal(review.additions,1);
  assert.equal(review.targetInUpload,true);assert.equal(review.targetInMerged,true);assert.equal(review.deleted,0);assert.equal(review.changed,0);
  const result=await api.publish('앱',review.id), merged=await store.get('viewfinder:index:앱');
  assert.deepEqual(merged.screens,[...base.screens,incoming]);assert.deepEqual(merged.files,base.files);assert.deepEqual(merged.excluded,base.excluded);
  assert.deepEqual(await store.get('viewfinder:index:플그'),before);assert.deepEqual((await store.get(result.backup)).index,base);
  assert.equal((await store.get('viewfinder:mcp-import:last:앱')).scope,'partial');assert.equal(await store.get('viewfinder:multi-draft:앱'),undefined);
  await assert.rejects(()=>api.publish('앱',review.id),/검토/);
});

test('동일 내용 중복은 건너뛰며 수집 시각만 달라도 중복, 내용 차이는 충돌로 전체 반영 차단',async()=>{
  const {store,api}=setup();const same={...screen('1:1'),syncedAt:'2026-11-23T00:00:00Z'};
  let r=await api.review('앱',index([same,screen()]));assert.equal(r.duplicates,1);assert.equal(r.additions,1);
  const changed={...screen('1:1'),texts:['다른 내용']};r=await api.review('앱',index([changed,screen()]));
  assert.equal(r.conflicts.length,1);assert.equal(r.canPublish,false);await assert.rejects(()=>api.publish('앱',r.id),/충돌/);
  assert.equal((await store.get('viewfinder:index:앱')).screens.length,1);
});

test('업로드 내부의 중복은 하나만 추가하고 다른 내용 중복은 충돌, 다른 파일의 같은 nodeId는 허용',async()=>{
  const {api}=setup();let r=await api.review('앱',index([screen(),screen(),screen('14330:42211',other)]));
  assert.equal(r.additions,2);assert.equal(r.duplicates,1);assert.equal(r.canPublish,true);
  r=await api.review('앱',index([screen(),{...screen(),name:'다름'}]));assert.equal(r.conflicts.length,1);assert.equal(r.canPublish,false);
});

test('다른 팀·미등록 파일·원본 링크 불일치·추가 비밀 필드·잘못된 중첩 데이터는 거부',async()=>{
  const invalid=[screen('2:1',file,'플그'),screen('3:1','UNREGISTERED'),{...screen('4:1'),figmaUrl:'https://example.com'},
    {...screen('5:1'),apiKey:'SYNTHETIC_SECRET'}, {...screen('6:1'),components:[{name:'버튼'}]}, {...screen('7:1'),tokens:[{}]},
    {...screen('8:1'),originalTeam:'크루'}, {...screen('9:1'),sourceId:'다른 출처'}, {...screen('10:1'),texts:[]}];
  const {api,store}=setup();const r=await api.review('앱',index([screen(),...invalid]));
  assert.equal(r.rejected.length,invalid.length);assert.equal(r.additions,1);assert.equal(r.canPublish,false);
  await assert.rejects(()=>api.publish('앱',r.id));assert.ok(!JSON.stringify([...store.data]).includes('SYNTHETIC_SECRET'));
});

test('PD 아카이브는 등록된 팀 페이지를 명시해야 하며 타 팀 페이지를 끼워 넣지 못한다',()=>{
  const pd=getFileSources('앱').find(s=>s.role==='archive');const s={...screen('10:1',pd.fileKey),pageId:pd.pageIds[0]};
  assert.equal(validateMcpImport(index([s]),'앱').rejected.length,0);
  assert.equal(validateMcpImport(index([{...s,pageId:'56:2'}]),'앱').rejected.length,1);
  delete s.pageId;assert.equal(validateMcpImport(index([s]),'앱').rejected.length,1);
});

test('운영 데이터 변경은 syncedAt 그대로여도 차단하고 새 검토 전에는 백업·운영 쓰기 없음',async()=>{
  const {store,api}=setup();const r=await api.review('앱',index([screen()]));
  const base=await store.get('viewfinder:index:앱');base.screens[0].texts.push('동시 변경');await store.set('viewfinder:index:앱',base);
  const writes=store.writes.length;await assert.rejects(()=>api.publish('앱',r.id),/운영 데이터가 변경/);
  assert.equal(store.writes.length,writes);assert.deepEqual(await store.get('viewfinder:index:앱'),base);
});

test('검토 만료·다른 검토 ID·추가할 화면 없음은 반영 차단',async()=>{
  const {api,advance}=setup();let r=await api.review('앱',index([screen()]));
  await assert.rejects(()=>api.publish('앱','다른-ID'));advance();await assert.rejects(()=>api.publish('앱',r.id),/만료/);
  r=await api.review('앱',index([screen('1:1')]));assert.equal(r.canPublish,false);await assert.rejects(()=>api.publish('앱',r.id));
});

test('REST 동기화 작업·초안이 있으면 격리하며 검토 뒤 시작된 REST 작업도 반영 차단',async()=>{
  for(const key of ['viewfinder:multi-job:앱','viewfinder:multi-draft:앱']){
    const {api,store}=setup();const r=await api.review('앱',index([screen()]));
    store.data.set(key,{unchanged:'REST'});
    await assert.rejects(()=>api.publish('앱',r.id),/REST/);await assert.rejects(()=>api.review('앱',index([screen()])),/REST/);
    assert.deepEqual(await store.get(key),{unchanged:'REST'});
  }
});

test('REST와 MCP는 같은 팀 잠금을 사용한다',async()=>{
  const {store,api}=setup();store.locks.set('viewfinder:multi-lock:앱','다른 작업');
  await assert.rejects(()=>api.review('앱',index([screen()])),/작업 중/);
  const rest=createSyncEngine({store,get:async()=>assert.fail('Figma 금지'),loadMds:async()=>assert.fail('Figma 금지')});
  await assert.rejects(()=>rest.publishDraft('앱'),/실행 중/);
});

test('백업 실패 시 운영은 보존되고 잠금은 해제된다',async()=>{
  const {store,api}=setup();const before=await store.get('viewfinder:index:앱');const r=await api.review('앱',index([screen()]));
  const set=store.set.bind(store);store.set=async(k,v)=>{if(k.startsWith('viewfinder:multi-backup:'))throw Error('가짜 백업 오류');return set(k,v);};
  await assert.rejects(()=>api.publish('앱',r.id),/백업 오류/);
  assert.deepEqual(await store.get('viewfinder:index:앱'),before);assert.equal(store.locks.size,0);
});

test('앱·플그·크루·공홈에서 등록 파일만 추가하고 다른 팀 키는 쓰지 않는다',async()=>{
  for(const team of ['앱','플그','크루','공홈']){
    const store=new MemoryStore(),api=createMcpImporter(store),key=getFileSources(team).find(s=>s.role!=='archive').fileKey;
    const s=screen('123:456',key,team),r=await api.review(team,index([s],team));assert.equal(r.canPublish,true);
    await api.publish(team,r.id);assert.deepEqual((await store.get(`viewfinder:index:${team}`)).screens,[s]);
    assert.ok(store.writes.every(k=>!k.startsWith('viewfinder:index:')||k===`viewfinder:index:${team}`));
  }
});

test('형식이 잘못된 기존 인덱스와 기존 중복을 자동 수정하지 않는다',async()=>{
  for(const base of [{team:'플그',screens:[],excluded:[]},index([screen('1:1'),screen('1:1')])]){
    const {api,store}=setup(base);await assert.rejects(()=>api.review('앱',index([screen()])));
    assert.deepEqual(await store.get('viewfinder:index:앱'),base);
  }
});

const poc='/private/tmp/viewfinder-mcp-app-poc/index.json';
test('실제 수집한 로컬 MCP JSON 4개를 메모리 병합: 정답·텍스트 순서·Empty 근거 ref 유지', {skip:!existsSync(poc)},async()=>{
  const input=JSON.parse(readFileSync(poc,'utf8')), target=input.screens.find(s=>s.id==='14330:42211');
  const {api,store}=setup();const r=await api.review('앱',input);assert.equal(r.rejected.length,0);assert.equal(r.additions,4);
  await api.publish('앱',r.id);const merged=(await store.get('viewfinder:index:앱')).screens.find(s=>s.id==='14330:42211');
  assert.deepEqual(merged,target);assert.deepEqual(getEvidence(merged),getEvidence(target));
  assert.ok(merged.texts.includes('아직 인기글이 없어요'));assert.ok(merged.texts.includes('아직 최신글이 없어요'));
  assert.deepEqual(merged.components,[]);assert.deepEqual(merged.tokens,[]);
});

const admin='FIXTURE_ADMIN_PASSWORD_123456', teamPassword='FIXTURE_TEAM_PASSWORD';
const request=(data,headers={})=>new Request('https://example.test/api/admin/mcp-import',{method:'POST',headers:{'content-type':'application/json','x-team-password':teamPassword,'x-mcp-admin-password':admin,...headers},body:JSON.stringify(data)});
async function authEnv(work){
  const old=[process.env.TEAM_PASSWORD,process.env.MCP_IMPORT_ADMIN_PASSWORD];process.env.TEAM_PASSWORD=teamPassword;process.env.MCP_IMPORT_ADMIN_PASSWORD=admin;
  try{await work();}finally{for(const [i,k] of ['TEAM_PASSWORD','MCP_IMPORT_ADMIN_PASSWORD'].entries()) if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}
}
test('서버는 팀+관리자 인증 필수, 관리자 미설정·짧음·공용 비밀번호 재사용 시 잠김',async()=>authEnv(async()=>{
  const noStore=()=>assert.fail('인증 전에 저장소 접근 금지');
  assert.equal((await handleMcpImport(request({}, {'x-team-password':'WRONG'}),noStore)).status,401);
  assert.equal((await handleMcpImport(request({}, {'x-mcp-admin-password':'WRONG'}),noStore)).status,401);
  for(const password of [undefined,'1234',teamPassword]){
    if(password===undefined)delete process.env.MCP_IMPORT_ADMIN_PASSWORD;else process.env.MCP_IMPORT_ADMIN_PASSWORD=password;
    assert.equal((await handleMcpImport(request({}),noStore)).status,503);
  }
}));

test('인증된 검토→확인→반영, 타 사이트·잘못된 JSON·확인 누락 차단, 안전한 오류만 응답',async()=>authEnv(async()=>{
  const {store}=setup();const call=req=>handleMcpImport(req,()=>store);
  assert.equal((await call(request({},{origin:'https://evil.test'}))).status,403);
  assert.equal((await call(request({},{'content-type':'text/plain'}))).status,415);
  assert.equal((await call(request({team:'어드민',action:'review'}))).status,400);
  const r=await call(request({action:'review',team:'앱',index:index([screen()])}));assert.equal(r.status,200);const review=await r.json();
  assert.equal((await call(request({action:'publish',team:'앱',id:review.id}))).status,400);
  assert.equal((await call(request({action:'publish',team:'앱',id:review.id,confirmed:true}))).status,200);
  const broken=new Request('https://example.test/api/admin/mcp-import',{method:'POST',headers:{'content-type':'application/json','x-team-password':teamPassword,'x-mcp-admin-password':admin},body:'{'});
  assert.equal((await call(broken)).status,400);
  const result=await handleMcpImport(request({action:'review',team:'앱',index:index([screen()])}),()=>{throw new Error('PRIVATE_CONNECTION_STRING');});
  assert.equal(result.status,500);assert.ok(!(await result.text()).includes('PRIVATE_CONNECTION_STRING'));
}));

test('Content-Length가 없어도 큰 요청은 읽기 중 차단하고 저장하지 않는다',async()=>authEnv(async()=>{
  const req=new Request('https://example.test/api/admin/mcp-import',{method:'POST',headers:{'content-type':'application/json','x-team-password':teamPassword,'x-mcp-admin-password':admin},body:' '.repeat(MAX_IMPORT_BYTES+1)});
  assert.equal((await handleMcpImport(req,()=>assert.fail('저장 금지'))).status,413);
}));
