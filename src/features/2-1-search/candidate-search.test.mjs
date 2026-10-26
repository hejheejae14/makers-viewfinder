import assert from "node:assert/strict";
import test from "node:test";

import { mockIndex } from "../../lib/mock-data.ts";
import { findCandidates, findCandidatesByConditions } from "./candidate-search.ts";
import { parseGeminiJson, parseInterpretation, parseJudgements } from "./gemini-validation.ts";
import { buildInterpretPrompt, buildJudgePrompt } from "./judge-prompt.ts";

const teamScreens = (team) => mockIndex.filter((screen) => screen.teamPage === team);

test("프레임 이름이 의미 없어도 화면 속 텍스트로 댓글 멘션 화면을 찾는다", () => {
  const [first] = findCandidates("커뮤니티 댓글 언급 기능 찾아줘", teamScreens("플그"));

  assert.equal(first.screen.id, "200:1");
  assert.deepEqual(first.unmatchedConditions, []);
  assert.ok(first.evidence.some((item) => item.source === "화면 속 텍스트"));
});

test("엠티뷰라는 표현을 빈 상태와 연결한다", () => {
  const results = findCandidates("알림 엠티뷰 찾아줘", teamScreens("앱"));

  assert.equal(results[0].screen.id, "300:5");
  assert.deepEqual(results[0].unmatchedConditions, []);
});

test("컴포넌트, variant, MDS 버전을 함께 검색한다", () => {
  const results = findCandidates("MDS v2 subtle 버튼", teamScreens("앱"));

  assert.ok(results.length > 0);
  assert.deepEqual(results[0].unmatchedConditions, []);
  assert.ok(results[0].evidence.some((item) => item.source === "컴포넌트"));
  assert.ok(results[0].evidence.some((item) => item.source === "variant"));
});

test("인덱스에서 아무 조건도 확인되지 않으면 후보를 만들지 않는다", () => {
  const results = findCandidates("항공권 결제 영수증", teamScreens("앱"));

  assert.deepEqual(results, []);
});

test("AI가 해석한 동의어 조건으로 후보를 찾는다", () => {
  const [first] = findCandidatesByConditions(teamScreens("플그"), [
    { label: "사람 호출", aliases: ["언급", "멘션"] },
    { label: "댓글", aliases: ["댓글"] },
  ]);

  assert.equal(first.screen.id, "200:1");
  assert.deepEqual(first.unmatchedConditions, []);
});

test("AI 판정 지침에 Find My Design의 필수 규칙을 포함한다", () => {
  const prompt = buildJudgePrompt("댓글 멘션", [
    {
      screenId: "200:1",
      section: "커뮤니티",
      name: "Frame 2609054",
      texts: ["댓글 달기", "@멘션할 사람을 선택하세요"],
      components: [],
      tokens: [],
      preliminaryMatches: ["댓글", "멘션"],
      preliminaryMisses: [],
    },
  ]);

  assert.match(prompt, /모든 필수 조건/);
  assert.match(prompt, /부분 일치/);
  assert.match(prompt, /후보에 없는 screenId를 만들지 않는다/);
  assert.doesNotMatch(prompt, /figmaUrl|fileKey/);
});

test("검색어 해석 지침은 사용자가 말하지 않은 조건을 만들지 못하게 한다", () => {
  const prompt = buildInterpretPrompt("댓글 언급 기능 찾아줘", "플그");

  assert.match(prompt, /사용자가 말하지 않은 조건은 만들지 않는다/);
  assert.match(prompt, /동의어/);
  assert.match(prompt, /댓글 언급 기능 찾아줘/);
});

test("Gemini의 검색 조건 JSON을 검증한다", () => {
  const value = parseGeminiJson('{"conditions":[{"label":"멘션","aliases":["멘션","언급"]}]}');

  assert.deepEqual(parseInterpretation(value), {
    conditions: [{ label: "멘션", aliases: ["멘션", "언급"] }],
  });
});

test("Gemini의 판정 JSON에서 잘못된 항목을 제외한다", () => {
  const judgements = parseJudgements([
    { screenId: "200:1", verdict: "정답 후보", reasons: ["댓글과 멘션 문구 확인"] },
    { screenId: "made-up", verdict: "잘못된 판정", reasons: [] },
  ]);

  assert.deepEqual(judgements, [
    { screenId: "200:1", verdict: "정답 후보", reasons: ["댓글과 멘션 문구 확인"], unmetConditions: undefined },
  ]);
});

test("Gemini가 JSON이 아닌 값을 주면 사용자에게 재시도를 안내한다", () => {
  assert.throws(() => parseGeminiJson("not json"), /올바른 JSON 형식/);
});
