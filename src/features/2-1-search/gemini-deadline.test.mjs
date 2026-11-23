import test from 'node:test';
import assert from 'node:assert/strict';
import { withGeminiDeadline, GEMINI_STAGE_TIMEOUT_MS } from './gemini-deadline.ts';

test('해석 20초·판정 40초가 기본이며, 응답 없는 작업은 정해진 시간 후 종료한다',async()=>{
  assert.deepEqual(GEMINI_STAGE_TIMEOUT_MS,{interpret:20000,judge:40000});let received;
  await assert.rejects(()=>withGeminiDeadline('judge',undefined,signal=>{received=signal;return new Promise(()=>{});},5),e=>e.diagnostic.kind==='timeout'&&e.diagnostic.stage==='judge');
  assert.equal(received.aborted,true);
});
test('사용자 취소는 시간 초과·네트워크 오류로 바꾸지 않고 전달한다',async()=>{
  const controller=new AbortController();let inner;
  const pending=withGeminiDeadline('interpret',controller.signal,signal=>{inner=signal;return new Promise(()=>{});},1000);
  controller.abort();await assert.rejects(()=>pending,e=>e.name==='AbortError');assert.equal(inner.aborted,true);
  await assert.rejects(()=>withGeminiDeadline('interpret',controller.signal,()=>assert.fail('이미 취소됨')),e=>e.name==='AbortError');
});
test('정상 완료 후 타이머·외부 취소 연결을 정리한다',async()=>{
  const controller=new AbortController();let inner;
  assert.equal(await withGeminiDeadline('judge',controller.signal,async signal=>{inner=signal;return 'done';},5),'done');
  controller.abort();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(inner.aborted,false);
});
