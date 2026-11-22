import "client-only";

import type { TeamIndex, TeamPage } from "../../lib/types";

interface LoadTeamIndexOptions {
  team: TeamPage;
  teamPassword: string;
  signal?: AbortSignal;
}

/** 브라우저에서 팀 비밀번호로 보호된 검색 인덱스를 읽습니다. */
export async function loadTeamIndex({ team, teamPassword, signal }: LoadTeamIndexOptions): Promise<TeamIndex> {
  let index: TeamIndex | undefined;
  let cursor: number | null = 0;
  do {
  signal?.throwIfAborted();
  const response = await fetch("/api/index-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-team-password": teamPassword,
    },
    body: JSON.stringify({ team, paginated: true, cursor, snapshot: index?.syncedAt }),
    cache: "no-store",
    signal,
  });

  const body = (await response.json().catch(() => null)) as TeamIndex | { error?: string } | null;
  if (!response.ok) {
    const message = body && "error" in body ? body.error : undefined;
    throw new Error(message ?? `검색 인덱스를 가져오지 못했어요. (${response.status})`);
  }

  const page = body as TeamIndex & { nextCursor?: number | null };
  if (!page || !Array.isArray(page.screens)) throw new Error("검색 인덱스 응답 형식이 올바르지 않습니다.");
  if (!index) index = { ...page, screens: [...page.screens] };
  else index.screens.push(...page.screens);
  const next = page.nextCursor ?? null;
  if (next !== null && next <= cursor) throw new Error("검색 인덱스 읽기가 진행되지 않습니다.");
  cursor = next;
  } while (cursor !== null);
  return index!;
}
