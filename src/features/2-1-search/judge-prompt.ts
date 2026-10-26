import type { TeamPage } from "../../lib/types";
import type { SearchCondition } from "./candidate-search";
import type { AiCandidate } from "./search";

export const SEARCH_INTERPRET_INSTRUCTIONS = `사용자의 자연어 화면 검색어를 검색 인덱스에서 확인할 필수 조건으로 나눈다.

규칙:
1. 팀은 별도로 선택되어 있으므로 조건에 다시 넣지 않는다.
2. "찾아줘", "화면", "기능"처럼 검색 결과를 구분하지 못하는 말은 제외한다.
3. 각 조건에는 사용자의 표현과 인덱스에 있을 법한 동의어를 aliases에 넣는다.
4. 기기(PC/MO), 상태(빈 상태/채워진 상태/오류), 화면 속 문구, 컴포넌트, variant, MDS 버전, 토큰 조건을 빠뜨리지 않는다.
5. 사용자가 말하지 않은 조건은 만들지 않는다.

반환 형식은 JSON 객체만 사용한다:
{"conditions":[{"label":"사용자에게 보여 줄 조건","aliases":["검색할 표현","동의어"]}]}`;

export function buildInterpretPrompt(query: string, team: TeamPage) {
  return `${SEARCH_INTERPRET_INSTRUCTIONS}\n\n${buildInterpretInput(query, team)}`;
}

export function buildInterpretInput(query: string, team: TeamPage) {
  return `선택한 팀:\n${team}\n\n사용자 검색어:\n${query.trim()}`;
}

/** Gemini와 NVIDIA 중 어느 제공자를 선택해도 공통으로 쓰는 Find My Design 판정 지침입니다. */
export const SEARCH_JUDGE_INSTRUCTIONS = `당신은 Figma 검색 인덱스에서 사용자의 조건을 실제로 만족하는 화면을 판정한다.

판정 규칙:
1. 화면 이름만으로 후보를 제외하거나 정답으로 확정하지 않는다.
2. 구역, 화면 속 텍스트, 컴포넌트, variant, MDS 버전, 토큰에서 확인되는 정보만 근거로 쓴다.
3. 사용자의 모든 필수 조건이 인덱스에서 확인되면 "정답 후보"다.
4. 일부 조건만 확인되면 "부분 일치"다. 이때 unmetConditions에 확인되지 않은 조건을 구체적으로 적는다.
5. 비슷해 보인다는 이유로 확인되지 않은 사실을 만들지 않는다.
6. 후보에 없는 screenId를 만들지 않는다.
7. 결과가 없으면 빈 배열을 반환한다.

반환 형식은 JSON 배열만 사용한다:
[{"screenId":"화면 ID","verdict":"정답 후보 또는 부분 일치","reasons":["인덱스에서 확인한 근거"],"unmetConditions":["부분 일치일 때 확인되지 않은 조건"]}]`;

export function buildJudgePrompt(query: string, candidates: AiCandidate[]) {
  return `${SEARCH_JUDGE_INSTRUCTIONS}\n\n${buildJudgeInput(query, candidates)}`;
}

export function buildJudgeInput(query: string, candidates: AiCandidate[]) {
  return `사용자 검색어:\n${query.trim()}\n\n후보 화면:\n${JSON.stringify(candidates)}`;
}

/** AI 응답을 받은 뒤 provider adapter가 이 모양으로 검증해 전달합니다. */
export interface SearchInterpretation {
  conditions: SearchCondition[];
}
