import assert from 'node:assert/strict';
import test from 'node:test';
import { requestWith503Retry } from './gemini-retry.ts';

test('503 후 성공: 기다린 뒤 한 번만 재요청하고 실제 요청 횟수 알림', async () => {
  let calls = 0, notices = 0; const delays = [];
  const result = await requestWith503Retry(async () => new Response('', { status: ++calls === 1 ? 503 : 200 }),
    { onRequest: () => notices++ }, async delay => { delays.push(delay); });
  assert.equal(calls, 2); assert.equal(notices, 2); assert.equal(result.status, 200);
  assert.equal(delays.length, 1); assert.ok(delays[0] >= 1000 && delays[0] < 1500);
});
test('계속 503이어도 총 2회, 다른 HTTP 오류와 네트워크 예외는 재시도 없음', async () => {
  let calls = 0;
  const result = await requestWith503Retry(async () => { calls++; return new Response('', { status: 503 }); }, {}, async () => {});
  assert.equal(calls, 2); assert.equal(result.status, 503);
  for (const status of [200, 400, 401, 403, 429, 500]) {
    calls = 0;
    await requestWith503Retry(async () => { calls++; return new Response('', { status }); }, {}, async () => assert.fail('재시도 금지'));
    assert.equal(calls, 1);
  }
  calls = 0;
  await assert.rejects(() => requestWith503Retry(async () => { calls++; throw new Error('fixture'); }));
  assert.equal(calls, 1);
});
test('Retry-After 준수, 긴 대기 지시일 때 추가 요청 없음', async () => {
  let calls = 0;
  await requestWith503Retry(async () => new Response('', { status: ++calls === 1 ? 503 : 200, headers: { 'retry-after': '3' } }), {}, async delay => assert.equal(delay, 3000));
  assert.equal(calls, 2);
  calls = 0;
  await requestWith503Retry(async () => { calls++; return new Response('', { status: 503, headers: { 'retry-after': '60' } }); }, {}, async () => assert.fail('긴 대기 시 중단'));
  assert.equal(calls, 1);
});
test('대기 중 취소하면 추가 요청 없음', async () => {
  let calls = 0; const controller = new AbortController();
  await assert.rejects(() => requestWith503Retry(async () => { calls++; return new Response('', { status: 503 }); },
    { signal: controller.signal }, async () => controller.abort()));
  assert.equal(calls, 1);
});
