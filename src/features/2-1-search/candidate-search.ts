import type { IndexedScreen } from "../../lib/types";

/** AI가 최종 판정하기 전에, 검색 인덱스에서 넓게 뽑아 둔 후보입니다. */
export interface SearchCandidate {
  screen: IndexedScreen;
  score: number;
  matchedConditions: string[];
  unmatchedConditions: string[];
  evidence: CandidateEvidence[];
}

export interface CandidateEvidence {
  condition: string;
  source: "구역" | "화면 이름" | "화면 속 텍스트" | "컴포넌트" | "variant" | "토큰";
  value: string;
}

export interface SearchCondition {
  label: string;
  aliases: string[];
}

interface SearchValue {
  source: CandidateEvidence["source"];
  value: string;
  normalized: string;
  weight: number;
}

const STOP_WORDS = new Set([
  "관련",
  "기능",
  "디자인",
  "보여줘",
  "보여주세요",
  "사용한",
  "사용하는",
  "스크린",
  "있는",
  "찾기",
  "찾아",
  "찾아줘",
  "찾아주세요",
  "페이지",
  "화면",
]);

/** 자주 쓰는 말과 인덱스에 들어 있는 표현이 다른 경우만 한곳에서 연결합니다. */
const CONCEPTS: SearchCondition[] = [
  { label: "빈 상태", aliases: ["빈 상태", "빈상태", "비어 있는", "비어있는", "엠티", "엠티뷰", "empty", "결과 없음", "결과없음"] },
  { label: "멘션", aliases: ["멘션", "언급", "mention", "태그"] },
  { label: "모바일", aliases: ["모바일", "mobile", "mo", "w375"] },
  { label: "PC", aliases: ["데스크톱", "desktop", "pc", "web", "w1920"] },
  { label: "오류", aliases: ["오류", "에러", "error"] },
  { label: "버튼", aliases: ["버튼", "button"] },
];

const SOURCE_WEIGHT: Record<CandidateEvidence["source"], number> = {
  구역: 6,
  "화면 이름": 6,
  "화면 속 텍스트": 5,
  컴포넌트: 4,
  variant: 3,
  토큰: 2,
};

export interface FindCandidateOptions {
  limit?: number;
}

/**
 * 화면 이름만으로 후보를 버리지 않고, 인덱스가 가진 모든 검색 가능 정보를 함께 확인합니다.
 * 이 단계는 후보를 넓게 줄이는 역할만 하며, 정답/부분 일치의 최종 판정은 AI가 담당합니다.
 */
export function findCandidates(
  query: string,
  screens: IndexedScreen[],
  options: FindCandidateOptions = {},
): SearchCandidate[] {
  return findCandidatesByConditions(screens, toSearchConditions(query), options);
}

/** AI가 해석한 조건으로 후보를 찾을 때 사용합니다. */
export function findCandidatesByConditions(
  screens: IndexedScreen[],
  conditions: SearchCondition[],
  options: FindCandidateOptions = {},
): SearchCandidate[] {
  const preparedConditions = prepareConditions(conditions);
  if (preparedConditions.length === 0) return [];

  const candidates = screens
    .map((screen) => matchScreen(screen, preparedConditions))
    .filter((candidate): candidate is SearchCandidate => candidate !== undefined)
    .sort(compareCandidates);

  return candidates.slice(0, options.limit ?? 20);
}

export function toSearchConditions(query: string): SearchCondition[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const found: SearchCondition[] = [];
  const coveredAliases = new Set<string>();

  for (const concept of CONCEPTS) {
    const aliases = concept.aliases.map(normalize);
    if (aliases.some((alias) => includesTerm(normalizedQuery, alias))) {
      found.push({ label: concept.label, aliases });
      for (const alias of aliases) coveredAliases.add(alias);
    }
  }

  for (const token of normalizedQuery.split(" ")) {
    if (token.length < 2 || STOP_WORDS.has(token)) continue;
    if ([...coveredAliases].some((alias) => includesTerm(alias, token))) continue;
    found.push({ label: token, aliases: [token] });
  }

  return dedupeConditions(found);
}

function matchScreen(screen: IndexedScreen, conditions: SearchCondition[]): SearchCandidate | undefined {
  const values = searchableValues(screen);
  const evidence: CandidateEvidence[] = [];
  const matchedConditions: string[] = [];
  const unmatchedConditions: string[] = [];
  let rawScore = 0;

  for (const condition of conditions) {
    const matches = values
      .filter((candidate) => condition.aliases.some((alias) => includesTerm(candidate.normalized, alias)))
      .sort((a, b) => b.weight - a.weight);

    const best = matches[0];
    if (!best) {
      unmatchedConditions.push(condition.label);
      continue;
    }

    matchedConditions.push(condition.label);
    rawScore += best.weight;
    evidence.push({ condition: condition.label, source: best.source, value: best.value });
  }

  if (matchedConditions.length === 0) return undefined;

  const coverage = matchedConditions.length / conditions.length;
  return {
    screen,
    score: Math.round(coverage * 1000 + rawScore),
    matchedConditions,
    unmatchedConditions,
    evidence,
  };
}

function searchableValues(screen: IndexedScreen): SearchValue[] {
  const values: Omit<SearchValue, "normalized" | "weight">[] = [];
  const add = (source: SearchValue["source"], value: string | undefined) => {
    if (value?.trim()) values.push({ source, value });
  };

  add("구역", screen.section);
  add("화면 이름", screen.name);
  for (const text of screen.texts) add("화면 속 텍스트", text);
  for (const component of screen.components) {
    add("컴포넌트", component.name);
    add("variant", component.variant);
    add("컴포넌트", component.library);
    if (component.isMds) add("컴포넌트", `MDS ${component.mdsVersion ?? ""}`);
  }
  for (const token of screen.tokens) add("토큰", token);

  return values.map((value) => ({
    ...value,
    normalized: normalize(value.value),
    weight: SOURCE_WEIGHT[value.source],
  }));
}

function compareCandidates(a: SearchCandidate, b: SearchCandidate) {
  return b.score - a.score || a.unmatchedConditions.length - b.unmatchedConditions.length || a.screen.name.localeCompare(b.screen.name, "ko");
}

function dedupeConditions(conditions: SearchCondition[]) {
  const seen = new Set<string>();
  return conditions.filter((condition) => {
    if (seen.has(condition.label)) return false;
    seen.add(condition.label);
    return true;
  });
}

function prepareConditions(conditions: SearchCondition[]) {
  return dedupeConditions(
    conditions
      .map((condition) => ({
        label: condition.label.trim(),
        aliases: [...new Set(condition.aliases.map(normalize).filter(Boolean))],
      }))
      .filter((condition) => condition.label && condition.aliases.length > 0),
  );
}

function includesTerm(text: string, term: string) {
  if (!term) return false;
  if (/^[a-z0-9]{1,2}$/.test(term)) return text.split(" ").includes(term);
  return text.includes(term) || (term.length >= 3 && text.length >= 3 && term.includes(text));
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[_/\\|()[\]{}.,!?@'":;+*-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
