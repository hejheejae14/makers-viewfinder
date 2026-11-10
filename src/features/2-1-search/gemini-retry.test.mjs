import assert from "node:assert/strict";
import test from "node:test";
import { requestWithRetry } from "./gemini-retry.ts";

test("503 뒤 복구되면 두 번째 응답을 사용하고 실제 요청 수를 기록한다", async () => {
  let requests = 0;
  const delays = [];
  const response = await requestWithRetry(async () => new Response(null, { status: requests < 2 ? 503 : 200 }), {
    onRequest: () => requests++, wait: async (ms) => { delays.push(ms); },
  });
  assert.equal(response.status, 200);
  assert.equal(requests, 2);
  assert.deepEqual(delays, [1000]);
});

test("계속되는 503은 총 세 번까지만 요청한다", async () => {
  let requests = 0;
  const response = await requestWithRetry(async () => { requests++; return new Response(null, { status: 503 }); }, { wait: async () => {} });
  assert.equal(response.status, 503);
  assert.equal(requests, 3);
});

test("키와 한도 오류는 재시도하지 않는다", async () => {
  for (const status of [400, 403, 404, 429]) {
    let requests = 0;
    await requestWithRetry(async () => { requests++; return new Response(null, { status }); });
    assert.equal(requests, 1);
  }
});

test("취소하면 대기 뒤 추가 요청을 보내지 않는다", async () => {
  const controller = new AbortController();
  let requests = 0;
  await assert.rejects(requestWithRetry(async () => { requests++; return new Response(null, { status: 503 }); }, {
    signal: controller.signal, wait: async () => { controller.abort(); },
  }), { name: "AbortError" });
  assert.equal(requests, 1);
});
