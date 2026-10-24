import type { TeamPage } from "../../lib/types";
import { authorize, json } from "./auth";
import { TEAM_PAGE_NODE_IDS } from "./config";
import { getTeamIndex } from "./sync";

/**
 * 저장된 검색 인덱스를 돌려주는 서버 API입니다. (src/app/api/index-data/route.ts가 이 함수를 부릅니다.)
 *
 * POST { team } → TeamIndex ({ team, syncedAt, screens, excluded })
 * - 팀 비밀번호(x-team-password)를 서버에서 확인합니다. 비밀번호가 없거나 틀리면 인덱스를 돌려주지 않습니다.
 * - Figma를 읽지 않고 저장소(Redis)에 있는 값을 그대로 돌려주므로 Figma 토큰이 필요 없습니다.
 * - 한 번 응답 크기는 팀 페이지 하나의 인덱스(현재 1~2MB 안팎)입니다. 배포 환경의 응답 크기 한도(약 4.5MB)에 가까워지면 나눠서 돌려주도록 바꿔야 합니다.
 */

const TEAMS = Object.keys(TEAM_PAGE_NODE_IDS) as TeamPage[];

export async function handleIndexDataRequest(request: Request): Promise<Response> {
  const denied = authorize(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { team?: string } | null;
  const team = TEAMS.find((candidate) => candidate === body?.team);
  if (!team) return json({ error: "team(앱, 플그, 크루, 공홈, 어드민)이 필요합니다." }, 400);

  try {
    const index = await getTeamIndex(team);
    if (!index) return json({ error: `${team} 페이지는 아직 동기화한 적이 없습니다.` }, 404);
    return json(index);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "알 수 없는 오류가 났습니다." }, 500);
  }
}
