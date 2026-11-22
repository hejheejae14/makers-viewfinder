import test from "node:test";
import assert from "node:assert/strict";
import { createSyncEngine, indexKey } from "./sync-engine.ts";
import { getFileSources, isAllowedSource, TEAM_FOLDERS } from "./file-registry.ts";
import { nodeToScreens } from "./convert.ts";
import { mergeLegacyIndexes } from "./index-merge.ts";
import { canPreview } from "./preview-access.ts";
import { pageIndex } from "./index-page.ts";
import { screenIdentity } from "../../lib/screen-identity.ts";
import { PD_FILE_KEY } from "./config.ts";
import { retrieveCandidates, candidateBudget } from "../2-1-search/candidate-search.ts";
import { guardUnderstanding } from "../2-1-search/query-understanding.ts";
import { runSearch } from "../2-1-search/search-pipeline.ts";
import { figmaGet, FigmaAccessError, FigmaRateLimitError } from "./figma-library.ts";
import { getScreenImageUrl, handleScreenImageRequest } from "./screen-image.ts";
import { handleIndexDataRequest } from "./index-data.ts";
import { handleSyncRequest } from "./handler.ts";
import { FileStore } from "./store.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// 모두 합성 Figma 응답이다. 실제 fileKey/대표 nodeId는 레지스트리·링크 회귀에만 사용한다.
const keys = { components: new Map(), styles: new Set() };
const box = (x=0,y=0,width=375,height=812) => ({x,y,width,height});
const frame = (id="1:1",name="이름 없는 화면",x=0) => ({id,name,type:"FRAME",absoluteBoundingBox:box(x),children:[
  {id:`${id}-text`,name:"홈",type:"TEXT",characters:"홈 · 아직 콘텐츠가 없어요",absoluteBoundingBox:box(x,0,200,30)},
  {id:`${id}-shape`,name:"배경",type:"RECTANGLE",absoluteBoundingBox:box(x)}
]});
const indexScreen = (fileKey,id="1:1",team="앱") => ({id,fileKey,teamPage:team,name:"홈",texts:["홈","아직 콘텐츠가 없어요"],components:[],tokens:[],figmaUrl:`https://www.figma.com/design/${fileKey}/?node-id=${id.replace(":","-")}`,syncedAt:"2026-11-22T00:00:00Z",sourceId:fileKey});
class MemoryStore {
  data=new Map(); locks=new Map();
  async get(k){return structuredClone(this.data.get(k));}
  async set(k,v){this.data.set(k,structuredClone(v));}
  async del(k){this.data.delete(k);}
  async acquireLock(k,owner){if(this.locks.has(k))return false;this.locks.set(k,owner);return true;}
  async releaseLock(k,owner){if(this.locks.get(k)===owner)this.locks.delete(k);}
}
function harness(team="앱",sources=getFileSources(team).filter(s=>s.role!=="archive"&&s.role!=="library-review").slice(0,2)){
  const store=new MemoryStore(), calls=[], failures=new Map(), versions=new Map(), names=new Map();
  let tick=Date.parse("2026-11-22T00:00:00Z");
  const get=async(path)=>{
    calls.push(path); const key=/\/files\/([^/?]+)/.exec(path)[1];
    if(failures.has(key)) throw Object.assign(new Error("가짜 오류"),{code:failures.get(key),retryAfter:60});
    if(path.includes("/nodes?")){const id=decodeURIComponent(path.split("ids=")[1]);return {nodes:{[id]:{document:frame(id)}}};}
    return {name:names.get(key)??sources.find(s=>s.fileKey===key)?.name??"[PD] 문서 모음",version:versions.get(key)??"v1",lastModified:"2026-11-22T00:00:00Z",
      document:{children:[{id:"56:4",name:"공홈",children:[{id:"1:1",type:"FRAME"}]},{id:"94:158216",name:"어드민",children:[{id:"2:1",type:"FRAME"}]},{id:"0:1",name:"솝레터",children:[{id:"3:1",type:"FRAME"}]}]}};
  };
  const engine=createSyncEngine({store,get,loadMds:async()=>keys,sources:()=>sources,now:()=>tick++});
  const finish=async()=>{for(let i=0;i<100;i++){const p=await engine.runSyncStep(team,"TEST_TOKEN",0);if(p.finished)return p;}throw Error("끝나지 않음");};
  return {store,calls,failures,versions,names,engine,finish,sources,advance:()=>{tick+=61_000;}};
}

test("등록 디자인 파일 수와 4개 팀·허용 폴더, 현재/과거 파일 보존",()=>{
  assert.deepEqual(["앱","플그","크루","공홈"].map(t=>getFileSources(t).filter(s=>s.role!=="archive").length),[10,14,10,5]);
  for(const t of ["앱","플그","크루","공홈"]){for(const s of getFileSources(t)){
    assert.equal(s.team,t);assert.ok(s.url.includes(s.fileKey));if(s.folderId)assert.equal(s.folderId,TEAM_FOLDERS[t]);
    assert.notEqual(s.folderId,"553109587");
  }}
  assert.ok(getFileSources("플그").some(s=>s.fileKey==="croueQo0peccyM6SJabMQw"));
  assert.ok(getFileSources("플그").some(s=>s.fileKey==="qpUMCNHsgTiiNGTZ5nYih7"));
  assert.equal(getFileSources("공홈").filter(s=>s.fileKey===PD_FILE_KEY).length,2);
  assert.equal(isAllowedSource("앱","croueQo0peccyM6SJabMQw"),false);
});
test("4개 팀 모두 여러 파일을 통합하되 임시 결과만 만들고 명시적 반영 전 기존 인덱스 유지",async()=>{
  for(const team of ["앱","플그","크루","공홈"]){
    const h=harness(team); const old={team,syncedAt:"old",screens:[],excluded:[]};await h.store.set(indexKey(team),old);
    await h.engine.planSync(team,"TEST_TOKEN"); await h.finish();
    assert.deepEqual(await h.store.get(indexKey(team)),old);
    const draft=await h.engine.getDraft(team);assert.equal(new Set(draft.screens.map(s=>s.fileKey)).size,2);
    assert.ok(!JSON.stringify([...h.store.data]).includes("TEST_TOKEN"));
    assert.equal(new Set(draft.screens.map(screenIdentity)).size,draft.screens.length);
    assert.ok(draft.screens.every(s=>s.teamPage===team&&s.designStatus==="unknown"));
    await h.engine.publishDraft(team);assert.equal((await h.engine.getTeamIndex(team)).screens.length,draft.screens.length);
  }
});
test("플그 38기·39기 동일 nodeId가 충돌하지 않고 원본 링크·출처 표기 유지",async()=>{
  const h=harness("플그");await h.engine.planSync("플그","TEST_TOKEN");await h.finish();
  const d=await h.engine.getDraft("플그");const same=d.screens.filter(s=>s.id==="1:1");assert.equal(same.length,2);
  assert.notEqual(screenIdentity(same[0]),screenIdentity(same[1]));
  for(const s of same){assert.ok(s.figmaUrl.includes(s.fileKey));assert.ok(s.figmaUrl.includes("node-id=1-1"));assert.ok(s.cohortLabels.length);}
});
test("모든 페이지를 읽고 이름·기획·draft로 조기 제외하지 않음",async()=>{
  const h=harness();await h.engine.planSync("앱","TEST_TOKEN");await h.finish();
  assert.equal(h.calls.filter(p=>p.includes("/nodes?")).length,6);
  const d=await h.engine.getDraft("앱");assert.ok(d.screens.some(s=>s.pageName==="솝레터"));
});
test("일부 파일 403 실패 시 기존 화면과 다른 파일의 성공 결과 보존, 실패 파일만 재시도",async()=>{
  const h=harness(),bad=h.sources[0].fileKey,good=h.sources[1].fileKey;
  await h.store.set(indexKey("앱"),{team:"앱",syncedAt:"old",screens:[indexScreen(bad,"9:9")],excluded:[]});
  h.failures.set(bad,"forbidden");await h.engine.planSync("앱","TEST_TOKEN");await h.finish();
  let d=await h.engine.getDraft("앱");assert.ok(d.screens.some(s=>s.id==="9:9"));assert.ok(d.screens.some(s=>s.fileKey===good));
  assert.equal(d.files.find(f=>f.fileKey===bad).retainedPrevious,true);
  h.failures.clear();h.calls.length=0;await h.engine.planSync("앱","TEST_TOKEN",true);await h.finish();
  d=await h.engine.getDraft("앱");assert.equal(d.files.find(f=>f.fileKey===bad).status,"success");
  assert.ok(d.screens.some(s=>s.fileKey===good));assert.ok(!h.calls.some(p=>p.includes(good)));
});
test("404는 삭제로 확정하지 않고 403과 구분하여 이전 데이터 유지",async()=>{
  const h=harness();for(const [i,s]of h.sources.entries())h.failures.set(s.fileKey,i?"forbidden":"not-found-or-inaccessible");
  await h.engine.planSync("앱","TEST_TOKEN");await h.finish();const d=await h.engine.getDraft("앱");
  assert.deepEqual(d.files.map(f=>f.errorCode),["not-found-or-inaccessible","forbidden"]);assert.match(d.files[0].message,/삭제로 확정하지/);
});
test("변경 없는 파일은 메타데이터만 읽고 다음 버전에서는 다시 상세 조회",async()=>{
  const h=harness();await h.engine.planSync("앱","TEST_TOKEN");await h.finish();await h.engine.publishDraft("앱");
  h.calls.length=0;await h.engine.planSync("앱","TEST_TOKEN");await h.finish();
  assert.equal(h.calls.filter(p=>p.includes("/nodes?")).length,0);assert.ok((await h.engine.getDraft("앱")).files.every(f=>f.status==="unchanged"));
  await h.engine.publishDraft("앱");h.versions.set(h.sources[0].fileKey,"v2");h.calls.length=0;
  await h.engine.planSync("앱","TEST_TOKEN");await h.finish();assert.equal(h.calls.filter(p=>p.includes("/nodes?")).length,3);
});
test("내용 버전이 같아도 파일명 변경은 인덱스 출처 표기에 반영",async()=>{
  const h=harness();await h.engine.planSync("앱","TEST_TOKEN");await h.finish();await h.engine.publishDraft("앱");
  h.names.set(h.sources[0].fileKey,"40기 새 이름");h.calls.length=0;
  await h.engine.planSync("앱","TEST_TOKEN");await h.finish();const draft=await h.engine.getDraft("앱");
  assert.ok(draft.screens.filter(s=>s.fileKey===h.sources[0].fileKey).every(s=>s.fileName==="40기 새 이름"&&s.cohortLabels.includes("40기")));
  assert.equal(h.calls.filter(p=>p.includes("/nodes?")).length,0);
});
test("공홈·어드민 아카이브 페이지를 둘 다 읽고 과거 어드민 키를 삭제하지 않음",async()=>{
  const sources=getFileSources("공홈").filter(s=>s.role==="archive"),h=harness("공홈",sources);
  const old={team:"어드민",syncedAt:"old",screens:[{...indexScreen(PD_FILE_KEY,"99:1","어드민"),sourceId:undefined}],excluded:[]};
  await h.store.set(indexKey("어드민"),old);
  assert.equal((await h.engine.getTeamIndex("공홈")).screens[0].teamPage,"공홈");
  await h.engine.planSync("공홈","TEST_TOKEN");await h.finish();const draft=await h.engine.getDraft("공홈");
  assert.ok(draft.screens.some(s=>s.sourceId==="archive:공홈"&&s.pageId==="56:4"));
  assert.ok(draft.screens.some(s=>s.originalTeam==="어드민"&&s.pageId==="94:158216"));
  assert.ok(!h.calls.some(p=>p.includes("ids=3")));
  await h.engine.publishDraft("공홈");assert.deepEqual(await h.store.get(indexKey("어드민")),old);
  assert.ok((await h.engine.getTeamIndex("공홈")).screens.some(s=>s.id==="99:1"));
});
test("공홈에서 기존 어드민 화면이 AI 판정 대상으로 전달됨 (가짜 AI)",async()=>{
  const legacy={team:"어드민",syncedAt:"old",screens:[indexScreen(PD_FILE_KEY,"1:1","어드민")],excluded:[]};
  const merged=mergeLegacyIndexes("공홈",undefined,legacy);let candidates;
  const result=await runSearch({query:"홈",team:"공홈",index:merged,ai:{interpret:async()=>({conditions:[]}),judge:async x=>{candidates=x.candidates;return [{screenId:"candidate-1",verdict:"정답 후보",relevance:"high",reasons:["합성 검증"],checks:[{conditionId:"guard-screen",status:"확인됨",evidenceRefs:["texts/0"],scope:"screen",explanation:"홈"}]}];}}});
  assert.equal(candidates.length,1);assert.equal(result.results[0].screen.originalTeam,"어드민");
});
test("미리보기는 실제 fileKey+nodeId와 팀 인덱스 소속 확인, 임의·다른 팀 파일 거부",()=>{
  const app=getFileSources("앱")[1].fileKey,plug=getFileSources("플그")[1].fileKey;
  const ix={team:"앱",screens:[indexScreen(app),indexScreen(plug,"1:1","플그")]};
  assert.equal(canPreview(ix,"앱",app,"1:1"),true);assert.equal(canPreview(ix,"앱",plug,"1:1"),false);
  assert.equal(canPreview(ix,"앱",app,"2:2"),false);assert.equal(canPreview(ix,"플그",app,"1:1"),false);
});
test("SECTION·GROUP·작업 컨테이너 안의 독립 화면, 숨김 제외, 부모 중복 방지",()=>{
  const root={id:"0:1",name:"솝레터",type:"SECTION",children:[{id:"g",name:"그룹",type:"GROUP",children:[{
    id:"container",name:"작업 모음",type:"FRAME",absoluteBoundingBox:box(0,0,2000,1400),children:[frame("1:1","일반",0),frame("1:2","Empty",500),{...frame("1:3"),visible:false}]
  }]}]};
  const d=nodeToScreens({document:root},{fileKey:"SYNTHETIC",teamPage:"앱",syncedAt:"now",mdsKeys:keys});
  assert.deepEqual(d.screens.map(s=>s.id),["1:1","1:2"]);assert.ok(d.excluded.some(f=>f.id==="container"));
});
test("정상 화면 안의 작은 카드 프레임은 독립 화면으로 중복 수집하지 않음",()=>{
  const root=frame();root.children.push({...frame("card"),absoluteBoundingBox:box(0,100,320,150)});
  const d=nodeToScreens({document:root},{fileKey:"SYNTHETIC",teamPage:"앱",syncedAt:"now",mdsKeys:keys});assert.deepEqual(d.screens.map(s=>s.id),["1:1"]);
});
test("화면 크기 조건에 맞는 작업 FRAME도 GROUP 안의 복수 화면을 펼침",()=>{
  const root={id:"wrapper",name:"작업실",type:"FRAME",absoluteBoundingBox:box(0,0,1200,1400),children:[{id:"group",name:"그룹",type:"GROUP",children:[frame("1:1","A",0),frame("1:2","B",500)]}]};
  const d=nodeToScreens({document:root},{fileKey:"SYNTHETIC",teamPage:"앱",syncedAt:"now",mdsKeys:keys});
  assert.deepEqual(d.screens.map(s=>s.id),["1:1","1:2"]);
});
test("컴포넌트 Variant가 같은 이름이어도 인스턴스 소속을 보존",()=>{
  const root=frame();root.children.push(...["a","b"].map(id=>({id,name:id,type:"INSTANCE",componentId:"c",absoluteBoundingBox:box()})));
  const d=nodeToScreens({document:root,components:{c:{key:"ck",name:"State=Empty",componentSetId:"set"}},componentSets:{set:{name:"Card"}}},{fileKey:"SYNTHETIC",teamPage:"앱",syncedAt:"now",mdsKeys:keys});
  assert.deepEqual(d.screens[0].components.map(c=>c.instanceId),["a","b"]);assert.equal(d.screens[0].components[0].variant,"State=Empty");
});
test("라이브러리·화면 없는 파일은 검토 상태, 기존 화면은 조용히 삭제하지 않음",async()=>{
  const source=getFileSources("크루").find(s=>s.role==="library-review"),h=harness("크루",[source]);
  await h.engine.planSync("크루","TEST_TOKEN");await h.finish();const d=await h.engine.getDraft("크루");assert.equal(d.files[0].status,"review");assert.equal(d.screens.length,0);
});
test("진행 중인 동기화 중복 시작·반영 금지, 이어 읽기 재개",async()=>{
  const h=harness();await h.engine.planSync("앱","TEST_TOKEN");await assert.rejects(()=>h.engine.planSync("앱","TEST_TOKEN"),/실행 중/);
  await assert.rejects(()=>h.engine.publishDraft("앱"),/실행 중/);await h.engine.runSyncStep("앱","TEST_TOKEN",0);await h.finish();assert.ok(await h.engine.getDraft("앱"));
});
test("레지스트리에 다른 팀·허용되지 않은 폴더가 섞이면 시작 거부",async()=>{
  const base=getFileSources("앱")[1];
  for(const source of [{...base,team:"플그"},{...base,folderId:"553109587"}]){const h=harness("앱",[source]);await assert.rejects(()=>h.engine.planSync("앱","TEST_TOKEN"),/레지스트리|허용되지/);}
});
test("저장된 인덱스에 잘못 섞인 다른 팀 파일도 읽기 병합에서 차단",()=>{
  const app=getFileSources("앱")[1].fileKey,plug=getFileSources("플그")[1].fileKey;
  const merged=mergeLegacyIndexes("앱",{team:"앱",syncedAt:"old",screens:[indexScreen(app),indexScreen(plug)],excluded:[]});
  assert.deepEqual(merged.screens.map(s=>s.fileKey),[app]);
});
test("429 이후 Retry-After 전에 추가 Figma 호출을 보내지 않음",async()=>{
  const h=harness();h.failures.set(h.sources[0].fileKey,"rate-limit");await h.engine.planSync("앱","TEST_TOKEN");
  await h.engine.runSyncStep("앱","TEST_TOKEN",0);const count=h.calls.length;
  await assert.rejects(()=>h.engine.runSyncStep("앱","TEST_TOKEN",0),/요청 제한/);assert.equal(h.calls.length,count);
  h.advance();h.failures.clear();await h.finish();assert.ok((await h.engine.getDraft("앱")).files.some(f=>f.status==="success"));
});
test("마지막 파일에서 429가 발생해 임시 결과가 완성돼도 즉시 재시도 금지",async()=>{
  const h=harness("앱",getFileSources("앱").filter(s=>s.role!=="archive").slice(0,1));h.failures.set(h.sources[0].fileKey,"rate-limit");
  await h.engine.planSync("앱","TEST_TOKEN");await h.finish();
  await assert.rejects(()=>h.engine.planSync("앱","TEST_TOKEN",true),/요청 제한/);
});
test("다중 파일 인덱스를 분할해도 모든 화면이 정확히 한 번 전달됨",()=>{
  const screens=Array.from({length:30},(_,i)=>indexScreen(`file-${i}`));const index={team:"앱",syncedAt:"now",screens,excluded:[]};
  let cursor=0,all=[];do{const page=pageIndex(index,cursor,2000);all.push(...page.screens);cursor=page.nextCursor;}while(cursor!==null);
  assert.deepEqual(all,screens);
});
test("대량 후보에서 파일·페이지별 관련 후보를 확보하고 기수로 기본 가산하지 않음",()=>{
  const cs=[{label:"홈",aliases:["홈"],kind:"screen",requirement:"must"},{label:"빈 상태",aliases:["없어요"],kind:"state",requirement:"must"}];
  const screens=Array.from({length:200},(_,i)=>({...indexScreen("file-a",String(i)),name:`A-${i}`,texts:["홈"]}));
  const target={...indexScreen("file-z","14330:42211"),name:"의미 없는 이름",pageName:"솝레터",cohortLabels:["35기"]};screens.push(target);
  const budget=candidateBudget(screens);assert.ok(retrieveCandidates(screens,cs,budget).some(c=>c.screen===target));assert.ok(budget<=60);
  const semantic={...target,texts:["표현이 완전히 다른 내용"],name:"Frame"};
  assert.ok(retrieveCandidates([...screens.slice(0,200),semantic],cs,budget).some(c=>c.screen===semantic));
  const many=Array.from({length:12},(_,i)=>({...indexScreen(`file-${i}`),cohortLabels:[`${39-i}기`]}));
  assert.equal(candidateBudget(many),36);assert.equal(new Set(retrieveCandidates(many,cs,36).map(c=>c.screen.fileKey)).size,12);
});
test("APP 대표 fileKey/nodeId는 두 검색어에서 후보 발견 가능 (내용은 합성, AI도 가짜)",async()=>{
  const key="Hbwppk3hFZm1jq7GuclyXG",target={...indexScreen(key,"14330:42211"),fileName:"[39기] APP handoff",pageName:"[SP1-3] 솝레터",section:"홈화면 Empty View",name:"ios-메인01-활동기수"};
  for(const query of ["앱서비스 홈 화면 Empty View","홈 화면에서 콘텐츠가 없을 때 표시되는 화면"]){
    let calls=0;const result=await runSearch({query,team:"앱",index:{team:"앱",syncedAt:"synthetic",screens:[target],excluded:[]},ai:{
      interpret:async()=>{calls++;return {conditions:[]};},judge:async({candidates,conditions})=>{calls++;assert.equal(candidates.length,1);return [{screenId:candidates[0].screenId,verdict:"정답 후보",relevance:"high",reasons:["합성 데이터"],checks:conditions.map(c=>({conditionId:c.id,status:"확인됨",scope:"screen",explanation:"합성 근거",evidenceRefs:[c.kind==="service"?"team":c.kind==="state"?"texts/1":"texts/0"]}))}];}
    }});assert.equal(result.results[0].screen.id,"14330:42211");assert.equal(result.results[0].verdict,"정답 후보");assert.equal(calls,2);
  }
});
test("기수는 명시할 때만 조건으로 보존하고 누적 파일 이름은 제작 기수 확정 근거가 아님",()=>{
  assert.ok(guardUnderstanding("38기 홈",{conditions:[]}).conditions.some(c=>c.kind==="cohort"&&c.aliases[0]==="38기"));
  assert.ok(!guardUnderstanding("홈",{conditions:[]}).conditions.some(c=>c.kind==="cohort"));
  assert.equal(guardUnderstanding("가능하면 38기 홈",{conditions:[]}).conditions.find(c=>c.kind==="cohort").requirement,"should");
});

test("실제 미리보기 요청 생성기는 선택 파일의 images GET URL 사용 (네트워크 가짜)",async()=>{
  const original=globalThis.fetch;let request;
  globalThis.fetch=async(url,options)=>{request={url,options};return Response.json({images:{"14330:42211":"https://example.test/temporary.png"}});};
  try{const key="Hbwppk3hFZm1jq7GuclyXG";const url=await getScreenImageUrl("14330:42211","TEST_TOKEN",1,key);
    assert.equal(url,"https://example.test/temporary.png");assert.match(request.url,new RegExp(`/v1/images/${key}\\?ids=14330%3A42211`));
    assert.ok(!request.options.method||request.options.method==="GET");assert.equal(request.options.cache,"no-store");
  }finally{globalThis.fetch=original;}
});
test("Figma 401·403·404·429를 구분하고 응답 본문·비밀 값을 오류에 넣지 않음",async()=>{
  const original=globalThis.fetch;
  try{for(const [status,code]of [[401,"authentication"],[403,"forbidden"],[404,"not-found-or-inaccessible"],[429,"rate-limit"]]){
    globalThis.fetch=async()=>new Response("SECRET_RESPONSE",{status,headers:{"retry-after":"120"}});
    await assert.rejects(()=>figmaGet("/v1/files/example","TEST_TOKEN"),error=>{assert.equal(error.code,code);assert.ok(!error.message.includes("SECRET_RESPONSE"));assert.ok(!error.message.includes("TEST_TOKEN"));if(status===429){assert.ok(error instanceof FigmaRateLimitError);assert.equal(error.retryAfter,120);}else assert.ok(error instanceof FigmaAccessError);return true;});
  }}finally{globalThis.fetch=original;}
});
test("인덱스·동기화·미리보기 API 모두 비밀번호 없이 저장소·Figma 조회 전에 거부",async()=>{
  const original=process.env.TEAM_PASSWORD;process.env.TEAM_PASSWORD="UNIT_TEST_PASSWORD";
  try{for(const handler of [handleIndexDataRequest,handleSyncRequest,handleScreenImageRequest]){
    const response=await handler(new Request("https://example.test/api",{method:"POST",body:JSON.stringify({team:"앱",action:"publish",nodeId:"1:1"})}));assert.equal(response.status,401);
  }}finally{if(original===undefined)delete process.env.TEAM_PASSWORD;else process.env.TEAM_PASSWORD=original;}
});
test("읽는 중 파일 버전이 바뀌면 부분 결과를 성공으로 반영하지 않음",async()=>{
  const h=harness("앱",getFileSources("앱").filter(s=>s.role!=="archive").slice(0,1));
  const old={team:"앱",syncedAt:"old",screens:[indexScreen(h.sources[0].fileKey,"9:9")],excluded:[]};await h.store.set(indexKey("앱"),old);
  await h.engine.planSync("앱","TEST_TOKEN");await h.engine.runSyncStep("앱","TEST_TOKEN",0);
  h.versions.set(h.sources[0].fileKey,"v2");await h.finish();const draft=await h.engine.getDraft("앱");
  assert.equal(draft.files[0].status,"failed");assert.deepEqual(draft.screens.map(s=>s.id),["9:9"]);
});
test("동기화 엔진의 동시 실행 잠금은 다른 요청을 실제로 거부",async()=>{
  const h=harness();await h.store.acquireLock("viewfinder:multi-lock:앱","other",180000);
  await assert.rejects(()=>h.engine.planSync("앱","TEST_TOKEN"),/실행 중/);assert.equal(h.calls.length,0);
});
test("로컬 저장소도 격리된 임시 폴더에서 잠금·원자적 교체 동작",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"viewfinder-unit-store-"));const store=new FileStore(dir);
  try{assert.equal(await store.acquireLock("lock","owner",10000),true);assert.equal(await store.acquireLock("lock","other",10000),false);
    await store.releaseLock("lock","other");assert.equal(await store.acquireLock("lock","other",10000),false);
    await store.releaseLock("lock","owner");assert.equal(await store.acquireLock("lock","other",10000),true);
    await store.set("index",{value:1});await store.set("index",{value:2});assert.deepEqual(await store.get("index"),{value:2});
  }finally{await rm(dir,{recursive:true,force:true});}
});
