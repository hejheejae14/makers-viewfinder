import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { INTERPRET_REQUEST_SCHEMA } from '../gemini-schema.ts';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS_API, GEMINI_GENERATION_DEFAULTS, GEMINI_STORE } from '../gemini-config.ts';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'client-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { runConnectionDiagnostic } = await import('./connection-diagnostic.ts');
const KEY = 'PRIVATE_KEY_CANARY';
const condition = { id: 'c1', kind: 'screen', label: '시험', aliases: ['시험'], sourceText: '시험', requirement: 'must', scope: 'screen' };
const output = [ 'test', JSON.stringify({ value: 'test' }), JSON.stringify({ value: 'test' }), JSON.stringify({ conditions: [condition] }) ];
const response = (i, finishReason = 'STOP') => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: output[i] }] } }] });
async function development(action) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try { await action(); } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
}

test('A~D 순서·최대 4회·동일 개인 키/모델/입력/설정, 현재 스키마 원형 유지', () => development(async () => {
  const requests = [], callbacks = [];
  const result = await runConnectionDiagnostic({ apiKey: KEY, onResult: r => callbacks.push(r) }, async (url, request) => {
    assert.equal(url, `${GEMINI_MODELS_API}/${DEFAULT_GEMINI_MODEL}:generateContent`);
    assert.equal(request.headers['x-goog-api-key'], KEY);
    requests.push(JSON.parse(request.body));
    return response(requests.length - 1);
  });
  assert.deepEqual(result.map(r => r.stage), ['A', 'B', 'C', 'D']);
  assert.ok(result.every(r => r.success));
  assert.equal(requests.length, 4); assert.equal(callbacks.length, 4);
  for (const req of requests) {
    assert.deepEqual(req.contents, requests[0].contents);
    assert.equal(req.generationConfig.maxOutputTokens, 1024);
    assert.equal(req.generationConfig.temperature, GEMINI_GENERATION_DEFAULTS.temperature);
    assert.equal(req.store, GEMINI_STORE);
    assert.equal(req.systemInstruction, undefined);
    assert.ok(!JSON.stringify(req).includes('14330:42211'));
    assert.ok(!JSON.stringify(req).includes('Hbwppk3hFZm1jq7GuclyXG'));
  }
  assert.equal(requests[0].generationConfig.responseMimeType, undefined);
  assert.equal(requests[1].generationConfig.responseMimeType, 'application/json');
  assert.equal(requests[1].generationConfig.responseJsonSchema, undefined);
  assert.deepEqual(requests[3].generationConfig.responseJsonSchema, INTERPRET_REQUEST_SCHEMA);
  const bases = requests.map(req => {
    const copy = structuredClone(req);
    delete copy.generationConfig.responseMimeType; delete copy.generationConfig.responseJsonSchema;
    return copy;
  });
  assert.ok(bases.every(base => JSON.stringify(base) === JSON.stringify(bases[0])));
  assert.deepEqual(Object.keys(result[0]), ['stage', 'httpStatus', 'success', 'googleCode', 'googleStatus', 'fields']);
  assert.ok(!JSON.stringify(result).includes(KEY));
}));

test('어느 단계든 첫 HTTP 실패에서 즉시 중단하고 원문 제거', () => development(async () => {
  for (let fail = 0; fail < 4; fail++) {
    let calls = 0;
    const result = await runConnectionDiagnostic({ apiKey: KEY }, async () => {
      const i = calls++;
      return i === fail ? Response.json({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'PRIVATE_RESPONSE_CANARY', details: [
        { fieldViolations: [{ field: 'generation_config.response_json_schema', description: KEY }] },
      ] } }, { status: 400 }) : response(i);
    });
    assert.equal(calls, fail + 1);
    assert.equal(result.at(-1).success, false);
    assert.equal(result.at(-1).googleStatus, 'INVALID_ARGUMENT');
    assert.deepEqual(result.at(-1).fields, ['generationConfig.responseJsonSchema']);
    assert.ok(!JSON.stringify(result).includes(KEY)); assert.ok(!JSON.stringify(result).includes('PRIVATE_RESPONSE_CANARY'));
  }
}));

test('네트워크·빈 응답·잘못된 JSON·출력 중단도 재시도 없이 중단', () => development(async () => {
  for (const fetcher of [async () => { throw new Error(KEY); }, async () => Response.json({}),
    async () => new Response('PRIVATE_RESPONSE_CANARY'), async () => response(0, 'MAX_TOKENS')]) {
    let calls = 0;
    const result = await runConnectionDiagnostic({ apiKey: KEY }, async (...args) => { calls++; return fetcher(...args); });
    assert.equal(calls, 1); assert.equal(result.length, 1); assert.equal(result[0].success, false);
    assert.ok(!JSON.stringify(result).includes(KEY));
  }
}));

test('JSON 모드·단순 스키마·현재 스키마의 응답 형식 실패를 통과시키지 않음', () => development(async () => {
  for (const fail of [1, 2, 3]) {
    let calls = 0;
    const result = await runConnectionDiagnostic({ apiKey: KEY }, async () => {
      const i = calls++;
      return i === fail ? Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: i === 1 ? 'not JSON' : '{}' }] } }] }) : response(i);
    });
    assert.equal(calls, fail + 1); assert.equal(result.at(-1).httpStatus, 200); assert.equal(result.at(-1).success, false);
  }
}));

test('키 미설정·취소·프로덕션에서 실제 호출 없음', () => development(async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return response(0); };
  await assert.rejects(() => runConnectionDiagnostic({ apiKey: '' }, fetcher));
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(await runConnectionDiagnostic({ apiKey: KEY, signal: controller.signal }, fetcher), []);
  process.env.NODE_ENV = 'production';
  await assert.rejects(() => runConnectionDiagnostic({ apiKey: KEY }, fetcher));
  assert.equal(calls, 0);
}));

test('D 전용은 A~C 없이 한 번만 호출하고 전체 진단의 D와 동일한 요청 사용', () => development(async () => {
  const full = [];
  await runConnectionDiagnostic({ apiKey: KEY }, async (url, req) => { full.push({ url, body: JSON.parse(req.body) }); return response(full.length - 1); });
  let calls = 0;
  const result = await runConnectionDiagnostic({ apiKey: KEY, mode: 'D-only' }, async (url, req) => {
    calls++;
    assert.deepEqual({ url, body: JSON.parse(req.body) }, full[3]);
    return response(3);
  });
  assert.equal(calls, 1); assert.deepEqual(result.map(r => r.stage), ['D']); assert.equal(result[0].success, true);
}));

test('D 전용도 HTTP 거부와 엄격한 배열 검증 실패를 재시도 없이 중단', () => development(async () => {
  for (const reply of [() => Response.json({ error: { code: 400, status: 'INVALID_ARGUMENT' } }, { status: 400 }),
    () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"conditions":[]}' }] } }] })]) {
    let calls = 0;
    const result = await runConnectionDiagnostic({ apiKey: KEY, mode: 'D-only' }, async () => { calls++; return reply(); });
    assert.equal(calls, 1); assert.equal(result.length, 1); assert.equal(result[0].stage, 'D'); assert.equal(result[0].success, false);
  }
}));
