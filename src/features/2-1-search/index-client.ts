import "client-only";

import type { TeamIndex, TeamPage } from "../../lib/types";

interface LoadTeamIndexOptions {
  team: TeamPage;
  teamPassword: string;
  signal?: AbortSignal;
}

/** 브라우저에서 팀 비밀번호로 보호된 검색 인덱스를 읽습니다. */
export async function loadTeamIndex({ team, teamPassword, signal }: LoadTeamIndexOptions): Promise<TeamIndex> {
  const response = await fetch("/api/index-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-team-password": teamPassword,
    },
    body: JSON.stringify({ team }),
    cache: "no-store",
    signal,
  });

  const body = (await response.json().catch(() => null)) as TeamIndex | { error?: string } | null;
  if (!response.ok) {
    const message = body && "error" in body ? body.error : undefined;
    throw new Error(message ?? `검색 인덱스를 가져오지 못했습니다. (${response.status})`);
  }

  return body as TeamIndex;
}
