import "client-only";

import type { SearchResponse, SearchResult, TeamPage } from "../../lib/types";
import { findCandidatesByConditions, type SearchCandidate, type SearchCondition } from "./candidate-search";
import { loadTeamIndex } from "./index-client";

export interface AiJudgement {
  screenId: string;
  verdict: SearchResult["verdict"];
  reasons: string[];
  unmetConditions?: string[];
}

export interface SearchAi {
  interpret(input: { query: string; team: TeamPage; signal?: AbortSignal }): Promise<{ conditions: SearchCondition[] }>;
  judge(input: { query: string; team: TeamPage; candidates: AiCandidate[]; signal?: AbortSignal }): Promise<AiJudgement[]>;
}

/** AI 판정에 꼭 필요한 내용만 담고 Figma 식별자·링크·위치 정보는 제외합니다. */
export interface AiCandidate {
  screenId: string;
  section?: string;
  name: string;
  texts: string[];
  components: {
    name: string;
    variant?: string;
    library?: string;
    isMds: boolean;
    mdsVersion?: "v1" | "v2";
  }[];
  tokens: string[];
  preliminaryMatches: string[];
  preliminaryMisses: string[];
}

interface SearchTeamOptions {
  query: string;
  team: TeamPage;
  teamPassword: string;
  ai: SearchAi;
  signal?: AbortSignal;
}

/**
 * 실제 2-1 검색 흐름입니다.
 * 개인 AI 키가 필요한 판정기를 반드시 전달하게 해, AI 키 없는 검색 모드가 생기지 않도록 합니다.
 */
export async function searchTeam({ query, team, teamPassword, ai, signal }: SearchTeamOptions): Promise<SearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error("검색어를 입력해 주세요.");

  // 비밀번호가 틀렸거나 인덱스가 없으면 AI 호출 비용이 들지 않도록 인덱스를 먼저 확인합니다.
  const index = await loadTeamIndex({ team, teamPassword, signal });
  const interpretation = await ai.interpret({ query: normalizedQuery, team, signal });
  const candidates = findCandidatesByConditions(index.screens, interpretation.conditions);
  if (candidates.length === 0) return { query: normalizedQuery, team, results: [] };

  const judgements = await ai.judge({ query: normalizedQuery, team, candidates: toAiCandidates(candidates), signal });
  return {
    query: normalizedQuery,
    team,
    results: joinJudgements(candidates, judgements),
  };
}

export function toAiCandidates(candidates: SearchCandidate[]): AiCandidate[] {
  return candidates.map(({ screen, matchedConditions, unmatchedConditions }) => ({
    screenId: screen.id,
    section: screen.section,
    name: screen.name,
    texts: screen.texts,
    components: screen.components.map(({ name, variant, library, isMds, mdsVersion }) => ({
      name,
      variant,
      library,
      isMds,
      mdsVersion,
    })),
    tokens: screen.tokens,
    preliminaryMatches: matchedConditions,
    preliminaryMisses: unmatchedConditions,
  }));
}

/** AI 응답의 화면 ID만 신뢰하고, 실제 화면 정보는 반드시 검색 인덱스에서 다시 붙입니다. */
export function joinJudgements(candidates: SearchCandidate[], judgements: AiJudgement[]): SearchResult[] {
  const screensById = new Map(candidates.map((candidate) => [candidate.screen.id, candidate.screen]));
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const judgement of judgements) {
    const screen = screensById.get(judgement.screenId);
    if (!screen || seen.has(judgement.screenId)) continue;
    if (!isValidJudgement(judgement)) continue;

    seen.add(judgement.screenId);
    results.push({
      screen,
      verdict: judgement.verdict,
      reasons: judgement.reasons.map((reason) => reason.trim()).filter(Boolean),
      ...(judgement.verdict === "부분 일치"
        ? { unmetConditions: judgement.unmetConditions?.map((condition) => condition.trim()).filter(Boolean) }
        : {}),
    });
  }

  return results;
}

function isValidJudgement(judgement: AiJudgement) {
  const reasons = judgement.reasons?.map((reason) => reason.trim()).filter(Boolean) ?? [];
  if (reasons.length === 0) return false;
  if (judgement.verdict === "정답 후보") return !judgement.unmetConditions?.some((condition) => condition.trim());
  if (judgement.verdict === "부분 일치") return Boolean(judgement.unmetConditions?.some((condition) => condition.trim()));
  return false;
}
