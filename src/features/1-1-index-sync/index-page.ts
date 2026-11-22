import type { TeamIndex } from "../../lib/types";

/** 큰 다중 파일 인덱스를 요청당 약 1MB씩 전달한다. 기존 화면 필드는 유지한다. */
export function pageIndex(index: TeamIndex, offset: number, maxBytes = 1_000_000) {
  const screens: TeamIndex["screens"] = [];
  let bytes = 0;
  for (const screen of index.screens.slice(offset)) {
    const size = new TextEncoder().encode(JSON.stringify(screen)).byteLength;
    if (size > maxBytes) throw new Error("화면 하나의 검색 정보가 전송 한도보다 큽니다. 해당 화면의 정보 분할이 필요합니다.");
    if (screens.length && bytes + size > maxBytes) break;
    screens.push(screen); bytes += size;
  }
  const next = offset + screens.length;
  return { team: index.team, syncedAt: index.syncedAt, screens,
    // 검색에 필요 없는 대량 제외 목록은 status에서 확인한다.
    excluded: [], files: offset === 0 ? index.files : undefined,
    totalScreens: index.screens.length, nextCursor: next < index.screens.length ? next : null };
}
