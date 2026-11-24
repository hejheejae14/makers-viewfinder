import type { SearchResponse, TeamIndex, TeamPage } from "../../lib/types";
import { candidateBudget, retrieveCandidates } from "./candidate-search";
import { canonicalTeam } from "../../lib/screen-identity";
import { isDescriptionFrame } from "../1-1-index-sync/screen-rules";
import { guardUnderstanding } from "./query-understanding";
import { toAiCandidates, verifyJudgements } from "./verification";
import type { AiJudgement, QueryUnderstanding, SearchAi } from "./search-model";
import type { SearchCandidate } from "./candidate-search";

/** 메모리 전용 진단 정보. 호출자가 명시적으로 받는 경우만 전달하며 자동 기록하지 않는다. */
export interface SearchTrace {
  query: string;
  team: TeamPage;
  syncedAt: string;
  totalScreens: number;
  scopedScreens: number;
  candidateLimit: number;
  candidateTruncated: boolean;
  interpretation?: QueryUnderstanding;
  candidates?: SearchCandidate[];
  judgements?: AiJudgement[];
  verification?: ReturnType<typeof verifyJudgements>;
  stage: "index" | "interpret" | "judge" | "complete";
}

export async function runSearch({ query, team, index, ai, signal, onTrace }: {
  query: string; team: TeamPage; index: TeamIndex; ai: SearchAi; signal?: AbortSignal; onTrace?: (trace: SearchTrace) => void;
}): Promise<SearchResponse> {
  const trimmed = query.trim();
  team = canonicalTeam(team);
  if (!trimmed) throw new Error("검색어를 입력해 주세요.");
  if (canonicalTeam(index.team) !== team) throw new Error("선택한 팀과 검색 인덱스의 팀이 달라요. 다시 불러와 주세요.");
  const screens = index.screens.filter((screen) => canonicalTeam(screen.teamPage) === team && !isDescriptionFrame(screen.name, screen.section)).map((s) => ({ ...s, teamPage: team }));
  const limit = candidateBudget(screens);
  const trace: SearchTrace = { query: trimmed, team, syncedAt: index.syncedAt, totalScreens: index.screens.length, scopedScreens: screens.length,
    candidateLimit: limit, candidateTruncated: screens.length > limit, stage: "index" };
  const publish = () => onTrace?.(structuredClone(trace));
  publish();
  if (!screens.length) return { query: trimmed, team, results: [] };
  signal?.throwIfAborted();
  trace.stage = "interpret"; publish();
  const interpretation = guardUnderstanding(trimmed, await ai.interpret({ query: trimmed, team, signal }));
  trace.interpretation = interpretation;
  const candidates = retrieveCandidates(screens, interpretation.conditions, trace.candidateLimit);
  trace.candidates = candidates;
  trace.stage = "judge"; publish();
  signal?.throwIfAborted();
  const judgements = await ai.judge({ query: trimmed, team, candidates: toAiCandidates(candidates), conditions: interpretation.conditions, signal });
  trace.judgements = judgements;
  const verified = verifyJudgements(candidates, judgements, interpretation.conditions, team);
  for (const item of verified) if (interpretation.warnings?.length) item.result.reasons.unshift(...interpretation.warnings.map(warning => `검색 해석 안내: ${warning}`));
  trace.verification = verified; trace.stage = "complete"; publish();
  return { query: trimmed, team, results: verified.map((item) => item.result) };
}
