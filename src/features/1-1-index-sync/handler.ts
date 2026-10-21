import type { TeamPage } from "../../lib/types";
import { authorize, json, readFigmaToken } from "./auth";
import { FigmaAccessError } from "./figma-library";
import { TEAM_PAGE_NODE_IDS } from "./config";
import { getSyncProgress, getTeamIndex, planSync, runSyncStep, SyncBusyError, SyncNotStartedError } from "./sync";

/**
 * 웹에서 동기화를 실행하는 서버 쪽 처리입니다. (src/app/api/index-sync/route.ts가 이 함수를 부릅니다.)
 *
 * 요청은 모두 POST이고 본문은 { action, team } 입니다.
 * - status:   현재 인덱스(동기화 시각, 화면 수)와 진행 중인 동기화
 * - start:    동기화를 처음부터 시작 (구역 목록 만들기)
 * - continue: 시간 예산 안에서 이어서 읽기. finished가 true가 될 때까지 반복 호출한다.
 *
 * 팀 비밀번호(TEAM_PASSWORD)를 서버에서 확인합니다. 비밀번호 확인은 화면이 아니라 이곳에서 합니다.
 * start, continue는 동기화하는 사람의 Figma 개인 토큰(헤더 x-figma-token)이 필요합니다. 토큰은 저장하지 않고 그 요청에서만 씁니다.
 */

/** 한 번 이어 읽을 때 새 구역을 시작하는 시간 한도. 구역 하나는 3~7초 걸리므로 route.ts의 maxDuration보다 충분히 작아야 한다. */
const STEP_BUDGET_MS = 30_000;

const TEAMS = Object.keys(TEAM_PAGE_NODE_IDS) as TeamPage[];
const ACTIONS = ["status", "start", "continue"] as const;
type Action = (typeof ACTIONS)[number];

export async function handleSyncRequest(request: Request): Promise<Response> {
  const denied = authorize(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { action?: string; team?: string } | null;
  const action = ACTIONS.find((candidate) => candidate === body?.action);
  const team = TEAMS.find((candidate) => candidate === body?.team);
  if (!action || !team) return json({ error: "action(status, start, continue)과 team(앱, 플그, 크루, 공홈, 어드민)이 필요합니다." }, 400);

  const figmaToken = readFigmaToken(request);
  if (action !== "status" && !figmaToken) {
    return json({ error: "Figma 토큰이 필요합니다. 본인의 Figma 개인 토큰을 입력하세요." }, 400);
  }

  try {
    return json(await run(action, team, figmaToken ?? ""));
  } catch (error) {
    if (error instanceof FigmaAccessError) return json({ error: error.message }, 403);
    if (error instanceof SyncBusyError || error instanceof SyncNotStartedError) return json({ error: error.message }, 409);
    // 오류 메시지에는 Figma 토큰 같은 비밀 값이 들어가지 않는다. (figma-library.ts는 요청 경로만 알린다.)
    return json({ error: error instanceof Error ? error.message : "알 수 없는 오류가 났습니다." }, 500);
  }
}

async function run(action: Action, team: TeamPage, figmaToken: string) {
  if (action === "start") return planSync(team, figmaToken);
  if (action === "continue") return runSyncStep(team, figmaToken, STEP_BUDGET_MS);

  const [index, pending] = await Promise.all([getTeamIndex(team), getSyncProgress(team)]);
  return {
    team,
    index: index
      ? {
          syncedAt: index.syncedAt,
          screens: index.screens.length,
          excluded: index.excluded.length,
          excludedByReason: summarizeExcluded(index.excluded),
        }
      : null,
    pending: pending ?? null,
  };
}

const EXAMPLES_PER_REASON = 8;

/** 제외한 프레임을 이유별로 묶어 개수와 예시 이름을 돌려준다. 화면 판정 기준이 맞는지 사람이 확인하는 용도 */
function summarizeExcluded(excluded: { name: string; reason: string }[]) {
  const byReason: Record<string, { count: number; examples: string[] }> = {};
  for (const { name, reason } of excluded) {
    const entry = (byReason[reason] ??= { count: 0, examples: [] });
    entry.count += 1;
    if (entry.examples.length < EXAMPLES_PER_REASON && !entry.examples.includes(name)) entry.examples.push(name);
  }
  return byReason;
}
