import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { prepareJudgeInput, MAX_JUDGE_INPUT_CHARS, MAX_CANDIDATE_CHARS } from './judge-payload.ts';
import { toAiCandidates, verifyJudgements } from './verification.ts';
import { matchScreen } from './candidate-search.ts';
import { getEvidence } from './evidence.ts';

const home={id:'c1',label:'홈',aliases:['홈'],kind:'screen',requirement:'must',scope:'screen'};
const empty={id:'c2',label:'빈 상태',aliases:['없어요'],kind:'state',requirement:'must',scope:'region'};
const conditions=[home,empty];
const screen=(id='1:1')=>({id,fileKey:'FIXTURE',teamPage:'앱',name:'메인',section:'홈',texts:['홈','아직 게시물이 없어요'],components:[],tokens:[],figmaUrl:'https://example.test',syncedAt:'fixture',width:375,height:812});
const candidates=screens=>toAiCandidates(screens.map(s=>matchScreen(s,conditions)));

test('작은 후보는 원문 evidence 한 벌과 ref·owner·위치만 전송하며 원본은 수정하지 않는다',()=>{
  const s={...screen(),components:[{name:'버튼',variant:'State=Empty',isMds:true}],elements:[{id:'2:2',component:'버튼',mdsVersion:'v2',texts:['없어요'],tokens:['fg'],box:{x:0,y:1,width:10,height:20}}]};
  const input=candidates([s]),original=structuredClone(input);const p=prepareJudgeInput('홈 Empty',input,conditions,'앱');const wire=JSON.parse(p.input).candidates[0];
  assert.deepEqual(wire.evidence,getEvidence(s));assert.deepEqual(wire.elementBoxes,[{owner:'elements/0',box:s.elements[0].box}]);
  for(const field of ['texts','components','tokens','elements','preliminaryMatches','preliminaryMisses'])assert.equal(field in wire,false);
  assert.equal(p.stats.limitedCandidates,0);assert.deepEqual(input,original);
});

test('큰 요청은 후보 60개와 뒤쪽 정답 단서를 유지하면서 총량·후보별 크기를 제한한다',()=>{
  const screens=Array.from({length:60},(_,i)=>({...screen(`${i}:1`),texts:[...Array.from({length:150},(_,j)=>`설명 ${j} ${'관계없는 내용 '.repeat(8)}`),'홈','아직 게시물이 없어요']}));
  const original=candidates(screens),p=prepareJudgeInput('홈 Empty',original,conditions,'앱'),wire=JSON.parse(p.input).candidates;
  assert.equal(wire.length,60);assert.ok(p.input.length<=MAX_JUDGE_INPUT_CHARS);assert.ok(p.stats.limitedCandidates>0);
  for(const [i,c]of wire.entries()){
    assert.equal(c.screenId,original[i].screenId);assert.ok(JSON.stringify(c).length<=MAX_CANDIDATE_CHARS);
    assert.ok(c.evidence.some(a=>a.ref==='texts/150'&&a.value==='홈'));assert.ok(c.evidence.some(a=>a.ref==='texts/151'&&a.value==='아직 게시물이 없어요'));
    assert.ok(c.evidence.every(a=>original[i].evidence.some(o=>JSON.stringify(o)===JSON.stringify(a))));
  }
});

test('하나의 거대한 문구는 잘라서 근거로 만들지 않고 명시적으로 생략한다',()=>{
  const c=candidates([{...screen(),texts:['홈','거대한 원문'.repeat(20_000),'아직 게시물이 없어요']}]);
  const p=prepareJudgeInput('홈',c,conditions,'앱'),wire=JSON.parse(p.input).candidates[0];
  assert.equal(wire.coverage.omittedEvidence,1);assert.ok(!wire.evidence.some(a=>a.ref==='texts/1'));assert.ok(wire.evidence.some(a=>a.ref==='texts/2'));
});

test('관련 컴포넌트와 variant의 owner 관계 및 제외 조건 단서는 함께 남긴다',()=>{
  const s={...screen(),texts:Array.from({length:300},()=>`설명 ${'긴 글 '.repeat(30)}`),components:[{name:'Comment',variant:'State=Empty',library:'MDS',isMds:true}]};
  const cs=[{...home,kind:'component',aliases:['Comment']},{...empty,kind:'property',aliases:['State=Empty'],relatedTo:'c1'},
    {id:'ex',kind:'text',label:'관리자 제외',aliases:['관리자'],requirement:'exclude'}];s.texts.push('관리자');
  const p=prepareJudgeInput('Comment Empty 관리자 제외',candidates([s]),cs,'앱'),atoms=JSON.parse(p.input).candidates[0].evidence;
  assert.ok(atoms.some(a=>a.ref==='components/0/name'&&a.owner==='components/0'));
  assert.ok(atoms.some(a=>a.ref==='components/0/variant'&&a.owner==='components/0'));
  assert.ok(atoms.some(a=>a.ref==='texts/300'&&a.value==='관리자'));
});

test('생략된 원문이 로컬에 존재해도 AI가 전달받지 않은 ref를 인용하면 확인됨이 아니다',()=>{
  const s=screen(),raw=[matchScreen(s,conditions)];
  const j={screenId:'candidate-1',verdict:'정답 후보',relevance:'high',reasons:['fixture'],providedEvidenceRefs:['texts/0'],evidenceIncomplete:true,
    checks:conditions.map((c,i)=>({conditionId:c.id,status:'확인됨',evidenceRefs:[`texts/${i}`],scope:'screen',explanation:'fixture'}))};
  const result=verifyJudgements(raw,[j],conditions,'앱');assert.equal(result[0].result.verdict,'부분 일치');
  assert.equal(result[0].checks[1].status,'확인 불가');assert.ok(result[0].result.reasons.some(r=>r.includes('일부 화면 정보')));
  const allVisible={...j,providedEvidenceRefs:['texts/0','texts/1']};
  assert.equal(verifyJudgements(raw,[allVisible],conditions,'앱')[0].result.verdict,'부분 일치');
  assert.equal(verifyJudgements(raw,[{...allVisible,evidenceIncomplete:false}],conditions,'앱')[0].result.verdict,'정답 후보');
});

test('조건 자체가 너무 크면 후보를 임의로 삭제하지 않고 전송 전에 크기 오류',()=>{
  assert.throws(()=>prepareJudgeInput('x'.repeat(MAX_JUDGE_INPUT_CHARS),candidates([screen()]),conditions,'앱'),e=>e.diagnostic.kind==='payload');
});

const poc='/private/tmp/viewfinder-mcp-app-poc/index.json';
test('실제 MCP 4개 화면은 모든 근거·정답 후보를 생략 없이 보존하며 기존 중복 형식보다 작다',{skip:!existsSync(poc)},()=>{
  const index=JSON.parse(readFileSync(poc,'utf8')),original=candidates(index.screens);const p=prepareJudgeInput('메인화면 Empty',original,conditions,'앱');
  assert.equal(p.stats.candidateCount,4);assert.equal(p.stats.limitedCandidates,0);
  assert.ok(p.input.length<JSON.stringify({query:'메인화면 Empty',selectedTeam:'앱',conditions,candidates:original}).length);
  for(const [i,c]of JSON.parse(p.input).candidates.entries())assert.deepEqual(c.evidence,original[i].evidence);
});
