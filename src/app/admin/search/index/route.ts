import { cookies } from "next/headers";
import { ADMIN_COOKIE, validAdminSession } from "@/features/2-1-search/admin-auth";
import { authorize, json } from "@/features/1-1-index-sync/auth";
import { getTeamIndex } from "@/features/1-1-index-sync/sync";
import { mockIndex } from "@/lib/mock-data";
import type { TeamPage } from "@/lib/types";

const TEAMS: TeamPage[] = ["앱", "플그", "크루", "공홈", "어드민"];

export async function POST(request: Request) {
  if (!validAdminSession((await cookies()).get(ADMIN_COOKIE)?.value)) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  const denied = authorize(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const team = TEAMS.find((team) => team === body?.team);
  if (!team || !["mock", "live"].includes(body?.source)) return json({ error: "팀과 데이터 종류를 확인해 주세요." }, 400);
  if (body.source === "mock") return json({ team, screens: mockIndex.filter((screen) => screen.teamPage === team), excluded: [], syncedAt: "2026-10-15T00:00:00Z" });
  try {
    const index = await getTeamIndex(team);
    return index ? json(index) : json({ error: "이 팀의 인덱스가 없습니다. /sync에서 먼저 동기화해 주세요." }, 404);
  } catch {
    return json({ error: "인덱스를 읽지 못했습니다. 서버 저장소 설정을 확인해 주세요." }, 503);
  }
}
