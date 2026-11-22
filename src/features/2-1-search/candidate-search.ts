import type { IndexedScreen } from "../../lib/types";
import type { SearchCondition } from "./search-model";
import { conditionMatches, getEvidence, includesTerm, normalize } from "./evidence";
export type { SearchCondition } from "./search-model";

export interface CandidateEvidence {
  condition: string;
  source: "구역" | "화면 이름" | "화면 속 텍스트" | "컴포넌트" | "variant" | "토큰" | "출처" | "기수 표기";
  value: string;
}
export interface SearchCandidate {
  screen: IndexedScreen;
  /** 기존 3-2 호출자 호환용 점수. 확률/정확도가 아니다. */
  score: number;
  matchedConditions: string[];
  unmatchedConditions: string[];
  evidence: CandidateEvidence[];
  requiredMatches: number;
  directMatches: number;
  hintMatches: number;
}
const STOP_WORDS = new Set(["관련", "기능", "디자인", "보여줘", "보여주세요", "사용한", "사용하는", "스크린", "있는", "찾기", "찾아", "찾아줘", "찾아주세요", "페이지", "화면"]);
const CONCEPTS: SearchCondition[] = [
  { label: "빈 상태", aliases: ["빈 상태", "빈상태", "비어 있는", "비어있는", "엠티", "엠티뷰", "empty", "결과 없음", "결과없음"] },
  { label: "멘션", aliases: ["멘션", "언급", "mention", "태그"] },
  { label: "모바일", aliases: ["모바일", "mobile", "mo", "w375"] },
  { label: "PC", aliases: ["데스크톱", "desktop", "pc", "web", "w1920"] },
  { label: "오류", aliases: ["오류", "에러", "error"] },
  { label: "버튼", aliases: ["버튼", "button"] },
];
const WEIGHTS: Record<CandidateEvidence["source"], number> = { 구역: 1, "화면 이름": 1, "화면 속 텍스트": 5, 컴포넌트: 4, variant: 3, 토큰: 2, 출처: 1, "기수 표기": 1 };
export interface FindCandidateOptions { limit?: number }

/** 기존 3-2 비교와 테스트용. 제품 검색은 AI 해석을 사용한다. */
export function toSearchConditions(query: string): SearchCondition[] {
  const normalized = normalize(query);
  const found = CONCEPTS.filter((concept) => concept.aliases.some((alias) => includesTerm(normalized, alias)));
  const tokens = normalized.split(" ").filter((token) => token.length >= 2 && !STOP_WORDS.has(token)
    && !found.some((concept) => concept.aliases.some((alias) => includesTerm(alias, token))));
  return [...found, ...tokens.map((token) => ({ label: token, aliases: [token] }))];
}
export function findCandidates(query: string, screens: IndexedScreen[], options: FindCandidateOptions = {}) {
  return findCandidatesByConditions(screens, toSearchConditions(query), options);
}

/** 페이지·파일명으로 조기 제외하지 않는다. 후보 단계의 미확인은 불충족이 아니다. */
export function findCandidatesByConditions(screens: IndexedScreen[], conditions: SearchCondition[], options: FindCandidateOptions = {}): SearchCandidate[] {
  const positive = conditions.filter((condition) => condition.requirement !== "exclude" && condition.aliases.some((alias) => alias.trim()));
  if (!positive.length) return [];
  return screens.map((screen) => matchScreen(screen, positive))
    .filter((candidate) => candidate.matchedConditions.length > 0)
    .sort(compareCandidates).slice(0, options.limit ?? 20);
}
export function matchScreen(screen: IndexedScreen, conditions: SearchCondition[]): SearchCandidate {
  const atoms = getEvidence(screen);
  const evidence: CandidateEvidence[] = [];
  const matchedConditions: string[] = [];
  const unmatchedConditions: string[] = [];
  let directMatches = 0, requiredMatches = 0, hintMatches = 0, rawScore = 0;
  for (const condition of conditions.filter((condition) => condition.requirement !== "exclude")) {
    const matches = atoms.filter((atom) => atom.source !== "팀" && conditionMatches(atom, condition))
      .sort((a, b) => Number(b.strength === "direct") - Number(a.strength === "direct"));
    const related = condition.relatedTo ? conditions.find((other) => other.id === condition.relatedTo) : undefined;
    const best = matches.find((atom) => !related || (atom.owner && atoms.some((other) => other.owner === atom.owner && conditionMatches(other, related))))
      ?? matches.find((atom) => atom.strength === "hint");
    if (!best) { unmatchedConditions.push(condition.label); continue; }
    matchedConditions.push(condition.label);
    if (best.strength === "direct") {
      directMatches++;
      if ((condition.requirement ?? "must") === "must") requiredMatches++;
    } else hintMatches++;
    const source = best.source as CandidateEvidence["source"];
    rawScore += WEIGHTS[source];
    evidence.push({ condition: condition.label, source, value: best.value });
  }
  return { screen, score: requiredMatches * 1000 + directMatches * 100 + rawScore, matchedConditions, unmatchedConditions, evidence, requiredMatches, directMatches, hintMatches };
}
function compareCandidates(a: SearchCandidate, b: SearchCandidate) {
  return b.requiredMatches - a.requiredMatches || b.directMatches - a.directMatches
    || a.unmatchedConditions.length - b.unmatchedConditions.length || b.hintMatches - a.hintMatches
    || b.score - a.score || a.screen.name.localeCompare(b.screen.name, "ko");
}

/** 이름이 일치하지 않는 후보도 파일·구역별 탐색 슬롯에 남긴다. 최종 결과의 개수 보정이 아니다. */
export function retrieveCandidates(screens: IndexedScreen[], conditions: SearchCondition[], limit = 20): SearchCandidate[] {
  const lexical = findCandidatesByConditions(screens, conditions, { limit: screens.length });
  if (lexical.length <= limit && screens.length <= limit) {
    const keys = new Set(lexical.map((candidate) => key(candidate.screen)));
    return [...lexical, ...screens.filter((screen) => !keys.has(key(screen))).map((screen) => matchScreen(screen, conditions))];
  }
  const result = lexical.slice(0, Math.max(1, limit - Math.max(5, Math.floor(limit / 3))));
  const keys = new Set(result.map((candidate) => key(candidate.screen)));
  const covered = new Set(result.map((candidate) => `${candidate.screen.fileKey}/${candidate.screen.pageId ?? candidate.screen.section ?? ""}`));
  // 입력 순서 대신 각 파일·페이지의 가장 관련 있는 화면을 탐색 슬롯에 둔다.
  const lexicalKeys = new Set(lexical.map((c) => key(c.screen)));
  const all = [...lexical, ...screens.filter((s) => !lexicalKeys.has(key(s))).map((s) => matchScreen(s, conditions))];
  for (const { screen } of all) {
    if (result.length >= limit) break;
    const bucket = `${screen.fileKey}/${screen.pageId ?? screen.section ?? ""}`;
    if (keys.has(key(screen)) || covered.has(bucket)) continue;
    result.push(matchScreen(screen, conditions)); keys.add(key(screen)); covered.add(bucket);
  }
  for (const candidate of lexical) {
    if (result.length >= limit) break;
    if (!keys.has(key(candidate.screen))) { result.push(candidate); keys.add(key(candidate.screen)); }
  }
  return result;
}
const key = (screen: IndexedScreen) => `${screen.fileKey}/${screen.id}`;

/** 여러 파일에서도 Gemini 호출은 한 번의 최종 판정으로 유지. 상한은 비용 한도이지 정확도 보장이 아니다. */
export function candidateBudget(screens: IndexedScreen[]) {
  return Math.min(60, Math.max(20, new Set(screens.map((s) => s.fileKey)).size * 3));
}
