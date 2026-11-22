import assert from "node:assert/strict";
import test from "node:test";
import { findCandidatesByConditions, retrieveCandidates } from "./candidate-search.ts";
import { getEvidence } from "./evidence.ts";
import { guardUnderstanding } from "./query-understanding.ts";
import { parseInterpretation, parseJudgements } from "./gemini-validation.ts";
import { verifyJudgements, toAiCandidates } from "./verification.ts";
import { runSearch } from "./search-pipeline.ts";

// 모든 ID와 파일은 가짜다. 실제 솝레터 프레임을 확인한 회귀 데이터가 아니다.
const home = { id: "home", label: "홈 화면", aliases: ["홈", "home"], kind: "screen", requirement: "must", sourceText: "홈", scope: "screen" };
const empty = { id: "empty", label: "빈 상태", aliases: ["없어요", "Empty", "비어 있어요"], kind: "state", requirement: "must", sourceText: "Empty", scope: "screen" };
const conditions = [home, empty];
const screen = (id, extra = {}) => ({ id, fileKey: "MOCK_FILE", teamPage: "앱", section: "[SP1-3] 솝레터 > 홈화면 Empty View",
  name: "Frame 123", texts: ["홈", "아직 게시물이 없어요"], components: [], tokens: [], width: 375, height: 812,
  figmaUrl: `https://www.figma.com/design/MOCK_FILE/?node-id=${id}`, syncedAt: "2026-11-22T00:00:00Z", ...extra });
const check = (conditionId, status, evidenceRefs, scope = "screen") => ({ conditionId, status, evidenceRefs, scope, explanation: "테스트 판정" });
const judgement = (screenId, checks, relevance = "high") => ({ screenId, verdict: "정답 후보", reasons: ["테스트 근거"], checks, relevance });
function verify(screens, judgements, queryConditions = conditions) {
  const candidates = screens.map((item) => ({ screen: item }));
  return verifyJudgements(candidates, judgements, queryConditions, "앱");
}

test("홈 Empty는 일반 홈보다 먼저 오며 필수조건 불충족을 정답으로 올리지 않는다", () => {
  const results = verify([screen("filled", { texts: ["홈", "게시물 12개"] }), screen("empty")], [
    judgement("candidate-1", [check("home", "확인됨", ["texts/0"]), check("empty", "불충족", ["texts/1"])]),
    judgement("candidate-2", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["texts/1"])]),
  ]);
  assert.deepEqual(results.map((item) => [item.result.screen.id, item.result.verdict]), [["empty", "정답 후보"], ["filled", "부분 일치"]]);
});

test("홈 구역의 게시물 상세는 구역명만으로 홈 전체가 되지 않는다", () => {
  const results = verify([screen("detail", { section: "홈", name: "게시물 상세", texts: ["댓글 3개"] })], [
    judgement("candidate-1", [check("home", "확인됨", ["section"]), check("empty", "확인 불가", [])]),
  ]);
  assert.deepEqual(results, []);
});

test("알림 Empty는 홈 조건이 실패하면 홈 Empty의 정확한 정답이 아니다", () => {
  const results = verify([screen("notification", { texts: ["알림", "새 알림이 없어요"] })], [
    judgement("candidate-1", [check("home", "불충족", ["texts/0"]), check("empty", "확인됨", ["texts/1"])]),
  ]);
  assert.equal(results[0].result.verdict, "부분 일치");
});

test("파일·페이지 이름이 솝레터이고 프레임 이름이 달라도 내부 근거로 홈 Empty 확인", () => {
  const results = verify([screen("fake-sopleter-regression")], [judgement("candidate-1", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["texts/1"])])]);
  assert.equal(results[0].result.verdict, "정답 후보");
  assert.match(results[0].result.screen.figmaUrl, /fake-sopleter-regression/);
});

test("이름이 홈 Empty여도 실제 내용이 다르고 이름만 인용하면 결과에서 제외한다", () => {
  const results = verify([screen("deceptive", { name: "홈 Empty", texts: ["콘텐츠 12개"] })], [
    judgement("candidate-1", [check("home", "확인됨", ["name"]), check("empty", "확인됨", ["name"])]),
  ]);
  assert.deepEqual(results, []);
});

test("부재 문장은 일반 명사와 일치하지 않는다", () => {
  const results = findCandidatesByConditions([screen("noun", { section: undefined, texts: ["콘텐츠"] })], [{ label: "콘텐츠 없음", aliases: ["콘텐츠가 없어요"] }]);
  assert.deepEqual(results, []);
});

test("컴포넌트와 variant는 같은 사용 정보에서 확인해야 한다", () => {
  const cs = [{ id: "button", label: "버튼", aliases: ["Button"], kind: "component", requirement: "must" },
    { id: "subtle", label: "subtle", aliases: ["subtle"], kind: "property", requirement: "must", relatedTo: "button" }];
  const s = screen("relation", { components: [{ name: "Button", variant: "primary", isMds: true }, { name: "Card", variant: "subtle", isMds: true }] });
  const results = verify([s], [judgement("candidate-1", [check("button", "확인됨", ["components/0/name"]), check("subtle", "확인됨", ["components/1/variant"])])], cs);
  assert.equal(results[0].result.verdict, "부분 일치");
  assert.equal(results[0].checks[1].status, "확인 불가");
  assert.ok(findCandidatesByConditions([s], cs)[0].unmatchedConditions.includes("subtle"));
});

test("일부 조건 근거 누락과 반대 사실을 구분하고 AI 순서를 같은 등급 안에서 유지", () => {
  const screens = [screen("contradicted"), screen("uncertain-b"), screen("exact"), screen("uncertain-a")];
  const results = verify(screens, [
    judgement("candidate-1", [check("home", "확인됨", ["texts/0"]), check("empty", "불충족", ["texts/1"])]),
    judgement("candidate-2", [check("home", "확인됨", ["texts/0"])]),
    judgement("candidate-3", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["texts/1"])]),
    judgement("candidate-4", [check("home", "확인됨", ["texts/0"])]),
  ]);
  assert.deepEqual(results.map((item) => item.result.screen.id), ["exact", "uncertain-b", "uncertain-a", "contradicted"]);
  assert.equal(results[1].checks[1].status, "확인 불가");
});

test("임의의 근거 ref, 없는 후보, 무관한 후보로 결과를 채우지 않는다", () => {
  const results = verify([screen("one")], [
    judgement("candidate-200", [check("home", "확인됨", ["texts/0"])]),
    judgement("candidate-1", [check("home", "확인됨", ["made-up"]), check("empty", "확인됨", ["not-real"])]),
  ]);
  assert.deepEqual(results, []);
  assert.deepEqual(verify([screen("one")], [judgement("candidate-1", [check("home", "확인됨", ["texts/0"])], "irrelevant")]), []);
});

test("카드 일부의 Empty는 화면 전체 Empty로 승격하지 않는다", () => {
  const s = screen("card", { elements: [{ id: "element", component: "Card", mdsVersion: "v2", texts: ["없어요"], tokens: [], box: { x: 0, y: 100, width: 300, height: 100 } }] });
  const results = verify([s], [judgement("candidate-1", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["elements/0/texts/0"], "element")])]);
  assert.equal(results[0].checks[1].status, "추정");
});

test("동일 프레임의 Empty·Filled 혼합 상태를 전체 화면 정답으로 확정하지 않는다", () => {
  const s = screen("mixed", { components: [{ name: "Card", variant: "State=Empty", isMds: true }, { name: "Card", variant: "State=Filled", isMds: true }] });
  const results = verify([s], [judgement("candidate-1", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["texts/1"])])]);
  assert.equal(results[0].result.verdict, "부분 일치");
  assert.match(results[0].checks[1].explanation, /함께/);
});

test("모든 조건의 직접 일치가 이름 가산점 때문에 부분 일치 아래로 밀리지 않는다", () => {
  const cs = Array.from({ length: 20 }, (_, i) => ({ label: `term${i}`, aliases: [`term${i}`] }));
  const names = screen("incomplete", { section: undefined, name: cs.slice(0, 19).map((item) => item.label).join(" "), texts: [] });
  const direct = screen("complete", { section: undefined, name: "Frame", texts: [], tokens: cs.map((item) => item.label) });
  assert.equal(findCandidatesByConditions([names, direct], cs)[0].screen.id, "complete");
});

test("작은 인덱스에서는 키워드가 하나도 없는 잠재 후보도 AI가 검토한다", () => {
  assert.equal(retrieveCandidates([screen("semantic", { section: "다른 페이지", name: "Frame", texts: ["의미가 다른 표현으로 기록됨"] })], conditions).length, 1);
});

test("팀 밖 데이터를 판정 AI로 전달하지 않고 동일 node ID도 요청별 ID로 구분", async () => {
  let seen;
  const index = { team: "앱", syncedAt: "test", excluded: [], screens: [screen("same"), screen("same", { fileKey: "OTHER_MOCK_FILE" }), screen("outside", { teamPage: "플그" })] };
  const result = await runSearch({ query: "홈 Empty", team: "앱", index, ai: {
    interpret: async () => ({ conditions }),
    judge: async ({ candidates }) => { seen = candidates; return []; },
  } });
  assert.equal(seen.length, 2);
  assert.deepEqual(seen.map((item) => item.screenId), ["candidate-1", "candidate-2"]);
  assert.deepEqual(result.results, []);
});

test("범위가 다른 팀의 인덱스는 AI 호출 전에 거부", async () => {
  await assert.rejects(runSearch({ query: "홈", team: "앱", index: { team: "플그", screens: [], syncedAt: "", excluded: [] }, ai: {} }), /팀이 달라/);
});

test("같은 팀의 다른 파일·구역은 이름이 달라도 탐색 슬롯에 남는다", () => {
  const screens = Array.from({ length: 23 }, (_, i) => screen(`home-${i}`, { section: "홈", texts: ["홈"] }));
  screens.push(screen("different-page", { fileKey: "OTHER_MOCK_FILE", section: "[SP1-3] 솝레터", name: "Frame 567", texts: ["다른 표현"] }));
  const results = retrieveCandidates(screens, conditions);
  assert.ok(results.some((item) => item.screen.id === "different-page"));
  assert.equal(results.length, 20);
});

test("AI가 누락한 명시적 홈·빈 상태 조건을 복구하고 경고를 남긴다", () => {
  const result = guardUnderstanding("홈 화면 Empty View", { conditions: [] });
  assert.deepEqual(result.conditions.map((condition) => condition.kind), ["screen", "state"]);
  assert.equal(result.warnings.length, 2);
});

test("원문에 없는 필수조건·잘못된 구조를 조용히 적용하지 않는다", () => {
  assert.throws(() => parseInterpretation({ conditions: [{ ...home, sourceText: "오류" }] }, "홈 화면"), /원문과 연결/);
  assert.throws(() => parseInterpretation({ conditions: [{ ...home }, null] }, "홈 화면"), /예상과 다른/);
  assert.throws(() => parseJudgements([{ screenId: "candidate-1", verdict: "정답 후보", reasons: ["근거"] }], true), /예상과 다른/);
});

test("선호·제외 조건을 필수로 승격하지 않고 제외가 확인되면 반환하지 않는다", () => {
  const optional = guardUnderstanding("가능하면 홈 화면", { conditions: [] });
  assert.equal(optional.conditions[0].requirement, "should");
  const excluded = { ...empty, requirement: "exclude" };
  assert.deepEqual(verify([screen("one")], [judgement("candidate-1", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["texts/1"])])], [home, excluded]), []);
});

test("인덱스 원문 ref는 실제 텍스트를 가리키고 결과 순위 진단은 비밀 값 없이 전달", async () => {
  let trace;
  const index = { team: "앱", syncedAt: "snapshot", screens: [screen("empty")], excluded: [] };
  const result = await runSearch({ query: "홈 Empty", team: "앱", index, onTrace: (value) => { trace = value; }, ai: {
    interpret: async () => ({ conditions }),
    judge: async () => [judgement("candidate-1", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["texts/1"])])],
  } });
  assert.equal(result.results[0].verdict, "정답 후보");
  assert.equal(trace.stage, "complete");
  assert.equal(trace.syncedAt, "snapshot");
  assert.equal(trace.verification[0].tier, 0);
  assert.equal(getEvidence(index.screens[0]).find((atom) => atom.ref === "texts/1").value, "아직 게시물이 없어요");
  assert.doesNotMatch(JSON.stringify(trace), /apiKey|teamPassword/);
  assert.equal(toAiCandidates(trace.candidates)[0].frame.width, 375);
});
