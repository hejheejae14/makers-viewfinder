import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// 실제 페이지 컴포넌트를 실행한다. DOM 대신 최소 훅/JSX 환경과 설정 완료 콜백을 사용한다.
// 기존 설정 폼의 실제 네트워크 확인·브라우저 저장을 수행하는 테스트는 아니다.
function harness(initialSession) {
  let session = initialSession, cursor = 0, diagnosticCalls = 0;
  const diagnosticModes = [];
  const slots = [];
  const state = init => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init;
    return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
  };
  const jsx = (type, props) => ({ type, props });
  const unsupported = () => { throw new Error('이 UX 테스트에서는 네트워크 호출 금지'); };
  const modules = {
    react: { useState: state, useRef: value => state(() => ({ current: value }))[0], useEffect: () => {} },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/mds': Object.fromEntries(['Button', 'Callout', 'Dialog', 'Select', 'TextButton', 'TextField'].map(name => [name, name])),
    '@/features/1-2-auth-key/SetupView': { SetupForm: 'ExistingSetupForm' },
    '@/lib/session': { useSession: () => session },
    '@/lib/screen-identity': { screenIdentity: () => 'unused' },
    '@/features/0-common-shell/ResultsPane': { ResultsPane: 'ResultsPane' },
    '@/features/0-common-shell/ResultDetail': { ResultDetail: 'ResultDetail' },
    '../gemini': { createGeminiSearchAi: unsupported, DEFAULT_GEMINI_MODEL: 'fixture' },
    '../search-pipeline': { runSearch: unsupported },
    '../gemini-error': { GeminiSearchError: class extends Error {} },
    './connection-diagnostic': { runConnectionDiagnostic: async ({ apiKey, onResult, mode }) => {
      assert.equal(apiKey, session.apiKey);
      diagnosticCalls++;
      diagnosticModes.push(mode);
      onResult({ stage: mode === 'D-only' ? 'D' : 'A', httpStatus: 400, success: false, googleCode: 400, googleStatus: 'INVALID_ARGUMENT', fields: [] });
    } },
    './McpPocSearch.module.css': { default: {} },
  };
  const source = readFileSync(new URL('./McpPocSearch.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const testBundle = { exports: {} };
  vm.runInNewContext(compiled, { module: testBundle, exports: testBundle.exports, require: name => {
    if (!(name in modules)) throw new Error(`예상하지 못한 모듈: ${name}`);
    return modules[name];
  }, fetch: unsupported, AbortController });
  return { render: () => { cursor = 0; return testBundle.exports.McpPocSearch(); }, setSession: value => { session = value; }, diagnosticCalls: () => diagnosticCalls, diagnosticModes: () => diagnosticModes };
}
function all(root) {
  if (!root || typeof root !== 'object') return [];
  return [root, ...[root.props?.children].flat(Infinity).flatMap(all)];
}
const find = (root, type, label) => all(root).find(n => n.type === type && (!label || n.props.children === label));

test('키 미설정·저장됨·초기 확인 상태 구분, 원문 키 비노출', () => {
  const h = harness(undefined);
  assert.ok(JSON.stringify(h.render()).includes('확인 중'));
  h.setSession(null);
  assert.ok(JSON.stringify(h.render()).includes('미설정'));
  const key = 'PRIVATE_KEY_CANARY';
  h.setSession({ password: 'PRIVATE_PASSWORD', apiKey: key });
  const tree = JSON.stringify(h.render());
  assert.ok(tree.includes('저장됨'));
  assert.ok(tree.includes('별도 확인'));
  assert.ok(!tree.includes(key)); assert.ok(!tree.includes('PRIVATE_PASSWORD'));
});

test('연결 진단은 버튼 클릭에서만 실행하고 중복 클릭·렌더링·설정 변경으로 재실행하지 않음', async () => {
  const h = harness({ password: 'fixture', apiKey: 'PRIVATE_KEY_CANARY' });
  let tree = h.render();
  assert.equal(h.diagnosticCalls(), 0);
  const experimental = all(tree).find(n => n.type === 'details' && all(n).some(child => child.type === 'summary' && String(child.props.children).includes('개발 전용 요청 실험')));
  assert.ok(experimental);
  assert.equal(experimental.props.open, undefined);
  assert.ok(JSON.stringify(experimental).includes('별도 실험'));
  const button = find(tree, 'Button', 'Gemini API 연결 진단 (A~D)');
  assert.equal(button.props.type, 'button');
  assert.ok(JSON.stringify(tree).includes('최대 4회'));
  assert.ok(JSON.stringify(tree).includes('$0.012'));
  button.props.onClick(); button.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = h.render();
  assert.equal(h.diagnosticCalls(), 1);
  assert.equal(find(tree, 'Button', 'Gemini API 연결 진단 (A~D)').props.disabled, true);
  assert.ok(JSON.stringify(tree).includes('INVALID_ARGUMENT'));
  assert.ok(!JSON.stringify(tree).includes('PRIVATE_KEY_CANARY'));
  h.setSession({ password: 'fixture', apiKey: 'CHANGED_PRIVATE_KEY' });
  tree = h.render();
  find(tree, 'Button', 'Gemini API 연결 진단 (A~D)').props.onClick();
  assert.equal(h.diagnosticCalls(), 1);
});

test('D 전용 버튼은 D-only 모드로 한 번 실행하며 전체 진단 버튼도 함께 잠금', async () => {
  const h = harness({ password: 'fixture', apiKey: 'PRIVATE_KEY_CANARY' });
  const tree = h.render();
  const button = find(tree, 'Button', '변경된 D 단계만 검증 (최대 1회)');
  assert.equal(h.diagnosticCalls(), 0); assert.equal(button.props.type, 'button');
  button.props.onClick(); button.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.diagnosticModes(), ['D-only']);
  const next = h.render();
  assert.equal(find(next, 'Button', '변경된 D 단계만 검증 (최대 1회)').props.disabled, true);
  assert.equal(find(next, 'Button', 'Gemini API 연결 진단 (A~D)').props.disabled, true);
  assert.ok(!JSON.stringify(next).includes('PRIVATE_KEY_CANARY'));
});

test('기존 설정 UI 모달을 재사용하고 닫기·가짜 저장 완료 후 검색어와 페이지 상태 유지', () => {
  const h = harness(null);
  let tree = h.render();
  find(tree, 'TextField').props.onChange({ target: { value: '유지할 검색어' } });
  find(tree, 'TextButton', '개인 키 등록·변경').props.onClick();
  tree = h.render();
  assert.equal(find(tree, 'Dialog').props.open, true);
  assert.equal(find(tree, 'ExistingSetupForm').props.variant, 'modal');
  find(tree, 'Dialog').props.onClose();
  tree = h.render();
  assert.equal(find(tree, 'Dialog').props.open, false);
  assert.equal(find(tree, 'TextField').props.value, '유지할 검색어');
  find(tree, 'TextButton', '개인 키 등록·변경').props.onClick();
  tree = h.render();
  h.setSession({ password: 'fixture', apiKey: 'PRIVATE_KEY_CANARY' });
  find(tree, 'ExistingSetupForm').props.onDone();
  tree = h.render();
  assert.equal(find(tree, 'Dialog').props.open, false);
  assert.equal(find(tree, 'TextField').props.value, '유지할 검색어');
  assert.ok(JSON.stringify(tree).includes('저장됨'));
  assert.ok(!JSON.stringify(tree).includes('PRIVATE_KEY_CANARY'));
});
