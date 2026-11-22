import "client-only";
import type { SearchResponse, TeamPage } from "../../lib/types";
import type { SearchAi } from "./search-model";
import { loadTeamIndex } from "./index-client";
import { runSearch, type SearchTrace } from "./search-pipeline";

export type { AiCandidate, AiJudgement, SearchAi } from "./search-model";
export { toAiCandidates } from "./verification";

interface SearchTeamOptions {
  query: string;
  team: TeamPage;
  teamPassword: string;
  ai: SearchAi;
  signal?: AbortSignal;
  onTrace?: (trace: SearchTrace) => void;
}

/** 브라우저에서 실행하고 개인 AI 키는 기존 어댑터 안에서만 사용한다. */
export async function searchTeam({ query, team, teamPassword, ai, signal, onTrace }: SearchTeamOptions): Promise<SearchResponse> {
  if (!query.trim()) throw new Error("검색어를 입력해 주세요.");
  const index = await loadTeamIndex({ team, teamPassword, signal });
  return runSearch({ query, team, index, ai, signal, onTrace });
}
