import assert from "node:assert/strict";
import test from "node:test";
import { findCandidatesByConditions, retrieveCandidates } from "./candidate-search.ts";
import { conditionMatches, getEvidence } from "./evidence.ts";
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
  assert.equal(result.results.length, 2);
  assert.ok(result.results.every(item => item.screen.teamPage === "앱" && item.verdict === "부분 일치"));
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

test("한 파일의 홈 메뉴 단서가 다른 파일의 실제 main 화면을 후보에서 밀어내지 않음", () => {
  const roles = [{ ...home, aliases: ["홈", "home", "메인", "main"] }];
  const screens = Array.from({ length: 35 }, (_, i) => screen(`admin-${i}`, { fileKey: "ADMIN", name: `관리 ${i}`, section: "관리", pageId: "1:1", texts: ["홈", "운영 관리"] }));
  for (const fileKey of ["PUBLIC_A", "PUBLIC_B"]) {
    screens.push(screen(`${fileKey}-other`, { fileKey, pageId: "2:1", section: "공홈 핸드오프", name: "activities", texts: ["활동 소개"] }));
    screens.push(screen(`${fileKey}-main`, { fileKey, pageId: "2:1", section: "공홈 핸드오프", name: "main_page_desktop_1440", texts: ["우리의 프로젝트", "함께하는 사람들"] }));
  }
  screens.push(screen("PUBLIC_B-wireframe", { fileKey: "PUBLIC_B", pageId: "3:1", section: "와이어프레임", name: "main_wireframe", texts: ["홈", "구조 검토"] }));
  const candidates = retrieveCandidates(screens, roles, 20);
  assert.equal(candidates.length, 20);
  assert.equal(new Set(candidates.map(c => `${c.screen.fileKey}/${c.screen.id}`)).size, 20);
  for (const fileKey of ["PUBLIC_A", "PUBLIC_B"]) assert.ok(candidates.some(c => c.screen.id === `${fileKey}-main`));
  assert.ok(candidates.some(c => c.screen.id === "PUBLIC_B-wireframe"));
  // 후보 이름은 정답 근거가 아니다. 빈 AI 판정이면 자동 승격하지 않는다.
  assert.ok(verifyJudgements(candidates, [], roles, "앱").every(v => v.result.verdict === "부분 일치"));
});

test("AI가 누락한 명시적 홈·빈 상태 조건을 복구하고 경고를 남긴다", () => {
  const result = guardUnderstanding("홈 화면 Empty View", { conditions: [] });
  assert.deepEqual(result.conditions.map((condition) => condition.kind), ["screen", "state"]);
  assert.equal(result.warnings.length, 2);
});

test("메인화면 Empty View는 화면 역할과 영역의 빈 상태를 분리하며 전체 Empty 명시는 보존", () => {
  const result = guardUnderstanding("메인화면 empty view 찾아줘", { conditions: [] });
  assert.equal(result.conditions.find(c => c.kind === "screen").scope, "screen");
  assert.equal(result.conditions.find(c => c.kind === "state").scope, "region");
  const entire = guardUnderstanding("메인화면 전체가 empty인 화면", { conditions: [] });
  assert.equal(entire.conditions.find(c => c.kind === "state").scope, "screen");
  assert.equal(guardUnderstanding("홈페이지 버튼", { conditions: [{ label: "버튼", aliases: ["버튼"], kind: "component" }] }).conditions.some(c => c.kind === "screen"), false);
});

test("검색어에 없는 팀 선택은 서비스 조건이 아니며 다른 불명확한 조건은 그대로 추정", () => {
  const raw = { conditions: [
    { id: "team", label: "앱", aliases: ["앱"], kind: "service", requirement: "must", sourceText: "앱", scope: "screen" },
    { ...home, sourceText: "메인화면" }, { ...empty, sourceText: "empty view", scope: "region" },
  ] };
  const result = parseInterpretation(raw, "메인화면 empty view 찾아줘", "앱");
  assert.deepEqual(result.conditions.map(c => c.kind), ["screen", "state"]);
  const explicit = parseInterpretation(raw, "앱 메인화면 empty view 찾아줘", "앱");
  assert.ok(explicit.conditions.some(c => c.kind === "service"));
  const unrelated = parseInterpretation({ conditions: [{ ...home, sourceText: "오류" }] }, "홈 화면", "앱");
  assert.equal(unrelated.conditions[0].sourceVerified, false);
});

test("메인화면의 띄어쓰기 차이는 조건을 중복 생성하지 않고 홈 동의어와 영역 범위를 보존", () => {
  const result = parseInterpretation({ conditions: [
    { ...home, aliases: ["메인"], sourceText: "메인 화면" },
    { ...empty, sourceText: "Empty View", scope: "screen" },
  ] }, "메인화면 empty view 찾아줘", "앱");
  assert.equal(result.conditions.length, 2);
  assert.ok(result.conditions[0].aliases.includes("홈"));
  assert.equal(result.conditions[1].scope, "region");
  const repeated = guardUnderstanding("메인화면 empty view 찾아줘", result);
  assert.deepEqual(repeated.conditions, result.conditions);
});

test("영역 Empty 요청은 홈에 프로필·행사 콘텐츠가 남아 있어도 홈 안의 빈 상태를 확인한다", () => {
  const queryConditions = [home, { ...empty, scope: "region" }];
  const results = verify([screen("home-region", { texts: ["홈", "아직 최신글이 없어요", "프로필", "1차 행사"] })], [
    judgement("candidate-1", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["texts/1"], "region")]),
  ], queryConditions);
  assert.equal(results[0].result.verdict, "정답 후보");
  const entire = verify([screen("home-region")], [
    judgement("candidate-1", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["texts/1"], "region")]),
  ]);
  assert.equal(entire[0].result.verdict, "부분 일치");
});

test("원문에 없는 필수조건·잘못된 구조를 조용히 적용하지 않는다", () => {
  const uncertain = parseInterpretation({ conditions: [{ ...home, sourceText: "오류" }] }, "홈 화면");
  assert.equal(uncertain.conditions[0].sourceVerified, false);
  assert.ok(uncertain.warnings.length);
  assert.throws(() => parseInterpretation({ conditions: [{ ...home }, null] }, "홈 화면"), /예상과 다른/);
  assert.throws(() => parseJudgements([{ screenId: "candidate-1", verdict: "정답 후보", reasons: ["근거"] }], true), /예상과 다른/);
});

test("부정 판정·low 후보는 실제 관련 단서가 있으면 정답 아래에서 솔직하게 추천", () => {
  const cs = [screen("nearby"), screen("exact")];
  const result = verify(cs, [
    { ...judgement("candidate-1", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["texts/1"])]), recommendationOnly: true },
    judgement("candidate-2", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["texts/1"])])
  ]);
  assert.deepEqual(result.map(r => [r.result.screen.id, r.result.verdict]), [["exact", "정답 후보"], ["nearby", "부분 일치"]]);
  assert.ok(result[1].result.reasons.some(r => r.includes("유사 화면 추천")));
});

test("원문 연결이 불확실한 조건은 실제 단서가 있어도 정답으로 승격하지 않음", () => {
  const result = verify([screen("one")], [judgement("candidate-1", [check("home", "확인됨", ["texts/0"]), check("empty", "확인됨", ["texts/1"])])], [home, { ...empty, sourceVerified: false }]);
  assert.equal(result[0].result.verdict, "부분 일치");
  assert.ok(result[0].result.unmetConditions.some(c => c.includes("추정")));
});

test("정답 없음은 최대 3개 실제 단서가 있는 후보만 추천, 무관·다른 팀·제외조건은 유지", () => {
  const related = Array.from({ length: 5 }, (_, i) => screen(`near-${i}`));
  const result = verify(related, []);
  assert.equal(result.length, 3); assert.ok(result.every(r => r.result.verdict === "부분 일치"));
  assert.deepEqual(verify([screen("unrelated", { texts: ["회원 설정"], section: undefined, name: "Frame" })], []), []);
  assert.deepEqual(verify([screen("other", { teamPage: "플그" })], []), []);
  assert.deepEqual(verify([screen("excluded")], [], [home, { ...empty, requirement: "exclude" }]), []);
});

test("빈 AI 판정은 조건 불충족과 구분하고 실제 관련 문구를 보여주되 정답으로 승격하지 않음", () => {
  const result = verify([screen("nearby", { texts: ["홈페이지", "홈", "아직 최신글이 없어요"] })], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].result.verdict, "부분 일치");
  assert.ok(result[0].checks.every(c => c.status === "확인 불가"));
  assert.deepEqual(result[0].checks.map(c => c.evidenceRefs), [["texts/1"], ["texts/2"]]);
  assert.ok(result[0].result.reasons.some(r => r.includes("AI가 판정 결과를 반환하지 않아")));
  assert.ok(result[0].result.reasons.some(r => r.includes("아직 최신글이 없어요")));
  assert.ok(result[0].result.reasons.every(r => !r.includes("인덱스 근거 없음") && !r.includes("홈페이지")));
});

test("홈페이지 링크만 있는 화면은 홈 화면의 관련 단서로 사용하지 않음", () => {
  const atom = { ref: "texts/0", source: "화면 속 텍스트", strength: "direct", value: "홈페이지" };
  assert.equal(conditionMatches(atom, home), false);
  assert.equal(conditionMatches({ ...atom, value: "홈" }, home), true);
  assert.equal(conditionMatches({ ...atom, value: "홈페이지" }, { kind: "text", aliases: ["홈페이지"] }), true);
  assert.deepEqual(verify([screen("footer", { section: undefined, name: "Frame", texts: ["홈페이지"] })], []), []);
});

test("영어 Empty View 해석에도 한국어 빈 상태 단서를 후보 선정에 유지", () => {
  const parsed = parseInterpretation({ conditions: [
    { ...home, sourceText: "메인화면" },
    { ...empty, aliases: ["Empty View", "empty"], sourceText: "empty view", scope: "region" },
  ] }, "메인화면 empty view 찾아줘", "앱");
  const state = parsed.conditions.find(c => c.kind === "state");
  assert.ok(state.aliases.includes("없어요"));
  const [candidate] = findCandidatesByConditions([screen("main", { texts: ["홈", "아직 최신글이 없어요"] })], parsed.conditions);
  assert.ok(candidate.matchedConditions.includes(state.label));
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
