import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { INTERPRET_SCHEMA, INTERPRET_REQUEST_SCHEMA, JUDGE_SCHEMA, validateGeminiSchema } from './gemini-schema.ts';
import { parseInterpretation, parseJudgements } from './gemini-validation.ts';
import { GeminiSearchError } from './gemini-error.ts';
import { runSearch } from './search-pipeline.ts';
import { parseSafeGeminiHttpError } from './gemini-http-error.ts';
import { SEARCH_INTERPRET_INSTRUCTIONS, SEARCH_JUDGE_INSTRUCTIONS } from './judge-prompt.ts';
import { DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL } from './gemini-config.ts';

// Node 테스트에서만 Next.js 번들 표식을 해제한다. 프로덕션의 client-only 경계는 그대로 둔다.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'client-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { createGeminiSearchAi } = await import('./gemini.ts');
const { requestGeminiJson } = await import('./gemini-request.ts');
const query = '홈 화면 Empty View';
const conditions = [
  { id: 'home', kind: 'screen', label: '홈 화면', sourceText: '홈 화면', requirement: 'must', scope: 'screen', aliases: ['홈'] },
  { id: 'empty', kind: 'state', label: '빈 상태', sourceText: 'Empty View', requirement: 'must', scope: 'screen', aliases: ['없어요'] },
];
const interpretation = { conditions };
const judgement = [{ screenId: 'candidate-1', verdict: '정답 후보', relevance: 'high', reasons: ['직접 문구 확인'], checks: [
  { conditionId: 'home', status: '확인됨', evidenceRefs: ['texts/0'], explanation: '홈 문구', scope: 'screen' },
  { conditionId: 'empty', status: '확인됨', evidenceRefs: ['texts/1'], explanation: '게시물 영역 문구', scope: 'region' },
] }];
const key = 'TEST_ONLY_NOT_A_REAL_KEY';
const ai = () => createGeminiSearchAi(key);
const envelope = (value, finishReason = 'STOP') => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] });
async function mocked(fetcher, action) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher; // 이 테스트 파일의 모든 통신은 메모리에서 응답한다.
  try { return await action(); } finally { globalThis.fetch = original; }
}
const interpret = () => ai().interpret({ query, team: '앱' });
function errorKind(kind, fields = {}) {
  return error => {
    assert.ok(error instanceof GeminiSearchError);
    assert.equal(error.diagnostic.kind, kind);
    for (const [k, v] of Object.entries(fields)) assert.equal(error.diagnostic[k], v);
    assert.ok(!JSON.stringify(error).includes(key));
    assert.ok(!error.message.includes('PRIVATE_CANARY'));
    return true;
  };
}

test('interpret·judge 모두 개인 키와 기존 JSON 모드 설정 사용, 서버 스키마 전송 없음', async () => {
  let calls = 0;
  await mocked(async (url, request) => {
    calls++;
    assert.match(url, /gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(request.headers['x-goog-api-key'], key);
    const body = JSON.parse(request.body);
    assert.deepEqual(body.generationConfig, { responseMimeType: 'application/json', temperature: 0.1 });
    assert.equal(Object.hasOwn(body.generationConfig, 'responseJsonSchema'), false);
    assert.equal(Object.hasOwn(body.generationConfig, 'responseSchema'), false);
    assert.equal(body.store, false);
    assert.ok(body.systemInstruction.parts[0].text);
    assert.equal(body.contents[0].role, 'user');
    return envelope(calls === 1 ? interpretation : judgement);
  }, async () => {
    assert.equal((await interpret()).conditions.length, 2);
    assert.equal((await ai().judge({ query, team: '앱', candidates: [], conditions }))[0].checks[1].scope, 'region');
  });
  assert.equal(calls, 2);
});

test('공통 interpret·judge는 각각 503 한 번만 재시도하고 실제 요청 수를 알린다', async () => {
  let calls = 0, notices = 0, retries = 0;
  const models = [], retryModels = [], requests = [];
  const adapter = createGeminiSearchAi(key, { onRequest: () => notices++, onRetry: (_stage, _delay, model) => { retries++; retryModels.push(model); } });
  await mocked(async (url, request) => {
    models.push(url.split('/').at(-1).split(':')[0]);
    requests.push(request.body);
    assert.equal(request.headers['x-goog-api-key'], key);
    calls++;
    if (calls === 1 || calls === 3) return Response.json({}, { status: 503 });
    return envelope(calls === 2 ? interpretation : judgement);
  }, async () => {
    await adapter.interpret({ query, team: '앱' });
    await adapter.judge({ query, team: '앱', candidates: [], conditions });
  });
  assert.equal(calls, 4); assert.equal(notices, 4); assert.equal(retries, 2);
  assert.deepEqual(models, [DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL, FALLBACK_GEMINI_MODEL, FALLBACK_GEMINI_MODEL]);
  assert.deepEqual(retryModels, [FALLBACK_GEMINI_MODEL, FALLBACK_GEMINI_MODEL]);
  assert.equal(requests[0], requests[1]); assert.equal(requests[2], requests[3]);
});

test('두 모델 모두 503이면 최대 두 요청에서 실패하고 판정 단계를 호출하지 않음', async () => {
  const models = [];
  const index = { team: '앱', syncedAt: 'fixture', excluded: [], screens: [
    { id: '1:1', fileKey: 'FIXTURE', teamPage: '앱', name: '홈', texts: ['홈'], components: [], tokens: [] },
  ] };
  await mocked(async url => {
    models.push(url.split('/').at(-1).split(':')[0]);
    return Response.json({ error: { code: 503, status: 'UNAVAILABLE', message: key } }, { status: 503 });
  }, () => assert.rejects(() => runSearch({ query, team: '앱', index, ai: ai() }), error => {
    errorKind('http-api', { stage: 'interpret', httpStatus: 503 })(error);
    assert.match(error.message, /기본 모델과 대체 모델/);
    return true;
  }));
  assert.deepEqual(models, [DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL]);
});

test('사용자가 지정한 모델은 503에도 임의의 다른 모델로 전환하지 않음', async () => {
  const models = [];
  await mocked(async url => {
    models.push(url.split('/').at(-1).split(':')[0]);
    return models.length === 1 ? new Response('', { status: 503 }) : envelope(interpretation);
  }, () => createGeminiSearchAi(key, { model: 'custom-model' }).interpret({ query, team: '앱' }));
  assert.deepEqual(models, ['custom-model', 'custom-model']);
});

test('503 이외 HTTP 실패에는 대체 모델 호출 없음', async () => {
  for (const status of [400, 401, 403, 404, 429, 500]) {
    let calls = 0;
    await mocked(async () => { calls++; return new Response('', { status }); },
      () => assert.rejects(interpret, errorKind('http-api', { httpStatus: status })));
    assert.equal(calls, 1);
  }
});

test('해석 성공 뒤 판정에서만 503이어도 대체 모델로 판정하며 근거 검증 형식 유지', async () => {
  const models = [];
  const adapter = ai();
  await mocked(async url => {
    models.push(url.split('/').at(-1).split(':')[0]);
    if (models.length === 2) return new Response('', { status: 503 });
    return envelope(models.length === 1 ? interpretation : judgement);
  }, async () => {
    await adapter.interpret({ query, team: '앱' });
    assert.equal((await adapter.judge({ query, team: '앱', candidates: [], conditions }))[0].checks[1].scope, 'region');
  });
  assert.deepEqual(models, [DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL]);
});

test('503 후 취소하거나 서버가 긴 대기를 요구하면 대체 모델을 호출하지 않음', async () => {
  for (const mode of ['cancel', 'retry-after']) {
    let calls = 0;
    const controller = new AbortController();
    const fetcher = async () => {
      calls++;
      return new Response('', { status: 503, headers: mode === 'retry-after' ? { 'retry-after': '60' } : {} });
    };
    await assert.rejects(() => requestGeminiJson({ apiKey: key, model: DEFAULT_GEMINI_MODEL,
      fallbackModel: FALLBACK_GEMINI_MODEL, stage: 'interpret', systemInstruction: 'fixture', input: '{}',
      signal: controller.signal, onRetry: () => controller.abort(),
    }, fetcher));
    assert.equal(calls, 1);
  }
});

test('요청·본문 수신·503 재시도 대기를 포함한 시간 초과는 추가 요청 없이 종료한다',async()=>{
  for(const mode of ['fetch','body','retry']){
    let calls=0;
    const fetcher=async(_url,{signal})=>{
      calls++;
      if(mode==='retry')return new Response('{}',{status:503});
      if(mode==='body')return {ok:true,status:200,text:()=>new Promise(()=>{})};
      return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    };
    await assert.rejects(()=>requestGeminiJson({apiKey:key,model:'fixture',stage:'judge',systemInstruction:'fixture',input:'{}',timeoutMs:5},fetcher),errorKind('timeout',{stage:'judge'}));
    assert.equal(calls,1);
  }
});

test('전송 바이트 한도를 넘으면 키나 원문을 표시하지 않고 API 호출 전 차단',async()=>{
  await assert.rejects(()=>requestGeminiJson({apiKey:key,model:'fixture',stage:'interpret',systemInstruction:'fixture',input:'x'.repeat(300_001)},async()=>assert.fail('추가 호출 금지')),errorKind('payload'));
});

test('일반 Gemini 어댑터는 압축된 근거만 전송하고 전송 범위를 로컬 판정에 연결한다',async()=>{
  const {toAiCandidates}=await import('./verification.ts');
  const candidate={screen:{id:'1:1',fileKey:'FIXTURE',teamPage:'앱',name:'홈',texts:['홈','아직 게시물이 없어요'],components:[],tokens:[]},matchedConditions:[],unmatchedConditions:[]};
  let stats;
  await mocked(async(_url,request)=>{
    const input=JSON.parse(JSON.parse(request.body).contents[0].parts[0].text);
    assert.ok(input.candidates[0].evidence.length>0);assert.equal('texts' in input.candidates[0],false);
    return envelope(judgement);
  },async()=>{
    const result=await createGeminiSearchAi(key,{onPayload:s=>{stats=s;}}).judge({query,team:'앱',candidates:toAiCandidates([candidate]),conditions});
    assert.ok(result[0].providedEvidenceRefs.includes('texts/1'));assert.equal(result[0].evidenceIncomplete,false);
  });
  assert.ok(Object.values(stats).every(v=>typeof v==='number'));
});

test('JSON 모드 프롬프트는 강화된 필드·조건 관계·근거 범위를 명시하며 서버 스키마를 전제하지 않음', () => {
  for (const field of INTERPRET_SCHEMA.properties.conditions.items.required) assert.ok(SEARCH_INTERPRET_INSTRUCTIONS.includes(field));
  for (const field of JUDGE_SCHEMA.items.required) assert.ok(SEARCH_JUDGE_INSTRUCTIONS.includes(field));
  for (const field of JUDGE_SCHEMA.items.properties.checks.items.required) assert.ok(SEARCH_JUDGE_INSTRUCTIONS.includes(field));
  assert.ok(!SEARCH_INTERPRET_INSTRUCTIONS.includes('제공된 응답 스키마'));
  assert.ok(SEARCH_INTERPRET_INSTRUCTIONS.includes('필수 must'));
  assert.ok(SEARCH_INTERPRET_INSTRUCTIONS.includes('제외'));
  assert.ok(SEARCH_JUDGE_INSTRUCTIONS.includes('일부'));
  assert.ok(SEARCH_JUDGE_INSTRUCTIONS.includes('같은 owner'));
  assert.ok(SEARCH_JUDGE_INSTRUCTIONS.includes('evidence.ref'));
});

test('JSON 모드 judge의 필수 필드 누락도 단계·HTTP·정확한 경로로 실패하고 추가 요청 없음', async () => {
  const invalid = structuredClone(judgement); delete invalid[0].checks[0].scope;
  let calls = 0;
  await mocked(async () => { calls++; return envelope(invalid); }, () => assert.rejects(
    () => ai().judge({ query, team: '앱', candidates: [], conditions }),
    errorKind('schema', { stage: 'judge', httpStatus: 200, finishReason: 'STOP', fieldPath: '$[0].checks[0].scope' })
  ));
  assert.equal(calls, 1);
});

test('JSON 모드에서도 존재하지 않는 evidenceRefs를 정답 근거로 인정하지 않음', async () => {
  const bad = structuredClone(judgement);
  bad[0].checks[1] = { ...bad[0].checks[1], evidenceRefs: ['texts/not-real'], scope: 'screen' };
  const index = { team: '앱', syncedAt: 'fixture', excluded: [], screens: [{ id: 'fake', fileKey: 'MOCK_FILE', teamPage: '앱', name: 'fixture', texts: ['홈', '아직 게시물이 없어요'], components: [], tokens: [], figmaUrl: 'https://www.figma.com/design/MOCK_FILE/?node-id=fake', syncedAt: 'fixture' }] };
  let calls = 0;
  await mocked(async () => envelope(++calls === 1 ? interpretation : bad), async () => {
    const result = await runSearch({ query, team: '앱', index, ai: ai() });
    assert.equal(result.results[0].verdict, '부분 일치');
    assert.ok(result.results[0].unmetConditions.some(c => c.includes('확인 불가')));
  });
  assert.equal(calls, 2);
});

test('필수 필드 누락: interpret와 judge의 모든 필수 경로를 보정 없이 거부', () => {
  for (const field of INTERPRET_SCHEMA.properties.conditions.items.required) {
    const value = structuredClone(interpretation); delete value.conditions[0][field];
    assert.throws(() => parseInterpretation(value, query), errorKind('schema', { stage: 'interpret', fieldPath: `$.conditions[0].${field}` }));
  }
  for (const field of JUDGE_SCHEMA.items.required) {
    const value = structuredClone(judgement); delete value[0][field];
    assert.throws(() => parseJudgements(value, true), errorKind('schema', { stage: 'judge', fieldPath: `$[0].${field}` }));
  }
  for (const field of JUDGE_SCHEMA.items.properties.checks.items.required) {
    const value = structuredClone(judgement); delete value[0].checks[0][field];
    assert.throws(() => parseJudgements(value, true), errorKind('schema', { fieldPath: `$[0].checks[0].${field}` }));
  }
});

test('잘못된 자료형·빈 문자열·열거값·길이 초과를 삭제/절단/기본값 없이 거부', () => {
  for (const aliases of ['홈', ['홈', 3], [' '], [], Array(13).fill('홈')]) {
    assert.throws(() => parseInterpretation({ conditions: [{ ...conditions[0], aliases }] }, query), errorKind('schema'));
  }
  for (const scope of [null, 'unknown', 1]) assert.throws(() => parseInterpretation({ conditions: [{ ...conditions[0], scope }] }, query), errorKind('schema'));
  assert.throws(() => parseInterpretation({ conditions: Array(21).fill(conditions[0]) }, query), errorKind('schema'));
  assert.throws(() => parseJudgements(Array(61).fill(judgement[0]), true), errorKind('schema'));
  const bad = structuredClone(judgement); bad[0].checks[0].evidenceRefs.push(3);
  assert.throws(() => parseJudgements(bad, true), errorKind('schema', { fieldPath: '$[0].checks[0].evidenceRefs[1]' }));
  assert.throws(() => parseJudgements([{ ...judgement[0], reasons: [] }], true), errorKind('schema'));
});

test('빈 judge 배열은 찾지 못함이며 정상 응답을 임의로 채우지 않음', () => {
  assert.deepEqual(parseJudgements([], true), []);
});

test('interpret 전송 스키마는 네 배열 길이 제약만 제외하고 필드·required·enum·객체 구조를 그대로 유지', () => {
  const strict = INTERPRET_SCHEMA.properties.conditions;
  assert.equal(strict.minItems, 1); assert.equal(strict.maxItems, 20);
  assert.equal(strict.items.properties.aliases.minItems, 1); assert.equal(strict.items.properties.aliases.maxItems, 12);
  const wire = structuredClone(INTERPRET_REQUEST_SCHEMA);
  const array = wire.properties.conditions;
  assert.equal(array.minItems, undefined); assert.equal(array.maxItems, undefined);
  assert.equal(array.items.properties.aliases.minItems, undefined); assert.equal(array.items.properties.aliases.maxItems, undefined);
  array.minItems = 1; array.maxItems = 20;
  array.items.properties.aliases.minItems = 1; array.items.properties.aliases.maxItems = 12;
  assert.deepEqual(wire, INTERPRET_SCHEMA);
  assert.deepEqual(array.items.required, ['id', 'label', 'aliases', 'kind', 'requirement', 'sourceText', 'scope']);
});

test('전송 스키마가 허용한 빈/초과 배열을 브라우저 검증에서는 그대로 거부', async () => {
  const cases = [ { conditions: [] }, { conditions: Array(21).fill(conditions[0]) },
    { conditions: [{ ...conditions[0], aliases: [] }] }, { conditions: [{ ...conditions[0], aliases: Array(13).fill('홈') }] } ];
  for (const value of cases) {
    validateGeminiSchema(value, INTERPRET_REQUEST_SCHEMA, 'interpret');
    await mocked(async () => envelope(value), () => assert.rejects(interpret, errorKind('schema', { httpStatus: 200, stage: 'interpret' })));
  }
});

test('구조 오류 진단: HTTP·종료 사유·실패 경로를 보존하고 추가 필드명은 노출하지 않음', async () => {
  await mocked(async () => envelope({ conditions: [{ ...conditions[0], aliases: 'PRIVATE_CANARY' }] }), async () => {
    await assert.rejects(interpret, errorKind('schema', { stage: 'interpret', httpStatus: 200, finishReason: 'STOP', fieldPath: '$.conditions[0].aliases' }));
  });
  assert.throws(() => validateGeminiSchema({ ...interpretation, PRIVATE_CANARY: 'private' }, INTERPRET_SCHEMA, 'interpret'), errorKind('schema', { fieldPath: '$' }));
});

test('네트워크 예외 원문을 기록하지 않고 network로 분류', async () => {
  let calls = 0;
  await mocked(async () => { calls++; throw new TypeError('PRIVATE_CANARY'); }, () => assert.rejects(interpret, errorKind('network', { httpStatus: null, finishReason: null })));
  assert.equal(calls, 1); // 자동 재시도 없음
});

test('HTTP 400/401/403/429/503을 JSON·스키마 오류와 구분', async () => {
  for (const status of [400, 401, 403, 429, 503]) await mocked(async () => new Response('PRIVATE_CANARY', { status }),
    () => assert.rejects(interpret, errorKind('http-api', { httpStatus: status, stage: 'interpret' })));
});

test('빈 응답·thought만 있는 응답은 empty로 분류', async () => {
  await mocked(async () => new Response('', { status: 200 }), () => assert.rejects(interpret, errorKind('empty', { fieldPath: '$response' })));
  for (const value of [{}, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: ' ' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'PRIVATE_CANARY' }] } }] }]) {
    await mocked(async () => Response.json(value), () => assert.rejects(interpret, errorKind('empty', { httpStatus: 200 })));
  }
});

test('응답 수신 중 연결 오류와 사용자 취소를 JSON 파싱 오류로 바꾸지 않음', async () => {
  await mocked(async () => ({ ok: true, status: 200, text: async () => { throw new TypeError('PRIVATE_CANARY'); } }),
    () => assert.rejects(interpret, errorKind('network', { httpStatus: 200 })));
  const controller = new AbortController(); controller.abort();
  await mocked(async () => { throw new DOMException('취소', 'AbortError'); },
    () => assert.rejects(() => ai().interpret({ query, team: '앱', signal: controller.signal }), { name: 'AbortError' }));
});

test('HTTP 본문 JSON과 모델 텍스트 JSON 파싱 오류를 구분 가능한 경로로 표시', async () => {
  await mocked(async () => new Response('PRIVATE_CANARY', { status: 200 }), () => assert.rejects(interpret, errorKind('json', { fieldPath: '$response' })));
  await mocked(async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json PRIVATE_CANARY' }] } }] }),
    () => assert.rejects(interpret, errorKind('json', { fieldPath: '$', finishReason: 'STOP' })));
});

test('정상 종료가 아닌 응답은 일부 JSON이 유효해도 성공으로 처리하지 않음', async () => {
  await mocked(async () => envelope(interpretation, 'MAX_TOKENS'), () => assert.rejects(interpret, errorKind('http-api', { httpStatus: 200, finishReason: 'MAX_TOKENS' })));
  await mocked(async () => envelope(interpretation, 'PRIVATE_CANARY'), () => assert.rejects(interpret, errorKind('http-api', { finishReason: 'UNRECOGNIZED' })));
});

test('의미 오류: ID 중복·잘못된 연결 관계는 여전히 거부', async () => {
  const cases = [
    { conditions: [conditions[0], conditions[0]] },
    { conditions: [{ ...conditions[0], relatedTo: 'PRIVATE_CANARY' }] },
  ];
  for (const value of cases) await mocked(async () => envelope(value), () => assert.rejects(interpret, errorKind('semantic', { stage: 'interpret', httpStatus: 200, finishReason: 'STOP' })));
});

test('원문 인용 불일치는 경고와 추정 표기로 계속 진행하고 임의 선호는 필수조건으로 보존', async () => {
  await mocked(async () => envelope({ conditions: [{ ...conditions[0], sourceText: '메인 페이지' }] }), async () => {
    const result = await interpret();
    assert.equal(result.conditions[0].sourceVerified, false);
    assert.ok(result.warnings.some(w => w.includes('원문 인용')));
  });
  const result = parseInterpretation({ conditions: [{ ...conditions[0], requirement: 'should' }] }, query);
  assert.equal(result.conditions[0].requirement, 'must');
  assert.ok(result.warnings.length);
  const equivalent = parseInterpretation({ conditions: [{ ...conditions[1], sourceText: 'emptyview' }] }, query);
  assert.notEqual(equivalent.conditions[0].sourceVerified, false);
});

test('불충족 후보는 명시적으로 추천 전용 처리하고 다른 잘못된 구조는 여전히 거부', () => {
  const value = structuredClone(judgement); value[0].verdict = '불충족 후보'; value[0].relevance = 'low';
  const result = parseJudgements(value, true);
  assert.equal(result[0].verdict, '부분 일치'); assert.equal(result[0].recommendationOnly, true);
  value[0].verdict = '임의의값';
  assert.throws(() => parseJudgements(value, true), errorKind('schema', { fieldPath: '$[0].verdict' }));
});

test('일반 검색과 MCP가 쓰는 같은 어댑터에서 영역 Empty와 화면 전체 Empty 요청을 구분', async () => {
  const index = { team: '앱', syncedAt: 'fixture', excluded: [], screens: [{ id: 'fake', fileKey: 'MOCK_FILE', teamPage: '앱', name: 'fixture', texts: ['홈', '아직 게시물이 없어요'], components: [], tokens: [], figmaUrl: 'https://www.figma.com/design/MOCK_FILE/?node-id=fake', syncedAt: 'fixture' }] };
  for (const [searchQuery, expected] of [[query, '정답 후보'], [`${query} 화면 전체`, '부분 일치']]) {
    let calls = 0;
    await mocked(async () => { calls++; return envelope(calls === 1 ? interpretation : judgement); }, async () => {
      const result = await runSearch({ query: searchQuery, team: '앱', index, ai: ai() });
      assert.equal(result.results[0].verdict, expected);
      assert.ok(result.results[0].reasons.some(reason => reason.includes('아직 게시물이 없어요')));
    });
    assert.equal(calls, 2);
  }
});

test('interpret 실패 시 judge 요청을 보내지 않음', async () => {
  let calls = 0;
  await mocked(async () => { calls++; return envelope({}); }, async () => {
    await assert.rejects(() => runSearch({ query, team: '앱', index: { team: '앱', syncedAt: '', screens: [{ teamPage: '앱', fileKey: 'MOCK_FILE' }] }, ai: ai() }), errorKind('schema'));
  });
  assert.equal(calls, 1);
});

test('HTTP 400 구조화 오류: code/status/reason/필드만 허용하고 message·metadata·description 제거', async () => {
  const body = { error: { code: 400, status: 'INVALID_ARGUMENT', message: `PRIVATE_CANARY ${key}`, details: [
    { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'PRIVATE_CANARY', metadata: { key } },
    { '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [
      { field: 'generation_config.response_json_schema', description: `PRIVATE_CANARY ${key}` },
      { field: 'generation_config.response_json_schema.properties[conditions].items.properties[aliases].max_items' },
      { field: `contents[0].parts[0].text.${key}` },
    ] },
  ] } };
  await mocked(async () => Response.json(body, { status: 400 }), async () => {
    await assert.rejects(interpret, error => {
      assert.ok(errorKind('http-api', { stage: 'interpret', httpStatus: 400, fieldPath: 'generationConfig.responseJsonSchema' })(error));
      assert.deepEqual(error.diagnostic.apiError, { code: 400, status: 'INVALID_ARGUMENT', reasons: ['API_KEY_INVALID'],
        fields: ['generationConfig.responseJsonSchema', 'generationConfig.responseJsonSchema.properties.conditions.items.properties.aliases.maxItems'], bodyState: 'parsed' });
      assert.ok(!JSON.stringify(error).includes('PRIVATE_CANARY'));
      return true;
    });
  });
});

test('알 수 없는 코드·사유·경로·오류 타입·임의 추가 필드를 노출하지 않음', () => {
  const body = { error: { code: 999999, status: 'PRIVATE_CANARY', details: [
    { reason: 'PRIVATE_CANARY', metadata: { key } },
    { '@type': 'PRIVATE_CANARY', reason: 'API_KEY_INVALID', fieldViolations: [{ field: 'model' }] },
    { fieldViolations: [{ field: 'x-goog-api-key' }, { field: 'contents[123456789].parts.text' }, { field: 'generation_config.PRIVATE_CANARY' }, { field: 'contents[0].parts[0].text' }] },
  ] } };
  assert.deepEqual(parseSafeGeminiHttpError(JSON.stringify(body)), { code: null, status: null, reasons: [], fields: ['contents.parts.text'], bodyState: 'parsed' });
});

test('HTTP 오류 본문이 빈 값·HTML·배열·잘못된 구조여도 HTTP 분류 유지', async () => {
  for (const [text, state] of [['', 'empty'], ['<html>PRIVATE_CANARY</html>', 'invalid-json'], ['null', 'unrecognized'], ['[]', 'unrecognized'], ['{"error":[]}', 'unrecognized'], ['x'.repeat(65537), 'oversized']]) {
    await mocked(async () => new Response(text, { status: 400 }), () => assert.rejects(interpret, error => {
      errorKind('http-api', { httpStatus: 400 })(error);
      assert.equal(error.diagnostic.apiError.bodyState, state);
      return true;
    }));
  }
});

test('HTTP 오류 본문 수신 실패와 상세 정보의 잘못된 자료형도 원문 없이 처리', async () => {
  await mocked(async () => ({ ok: false, status: 400, text: async () => { throw new Error(`PRIVATE_CANARY ${key}`); } }),
    () => assert.rejects(interpret, error => {
      errorKind('http-api', { httpStatus: 400 })(error);
      assert.equal(error.diagnostic.apiError.bodyState, 'unreadable'); return true;
    }));
  for (const details of [null, {}, [null, [], 'PRIVATE_CANARY', { fieldViolations: [null, { field: {} }] }]]) {
    const safe = parseSafeGeminiHttpError(JSON.stringify({ error: { code: '400', status: {}, details } }));
    assert.equal(safe.code, null); assert.equal(safe.status, null);
    assert.deepEqual(safe.reasons, []); assert.deepEqual(safe.fields, []);
  }
});
