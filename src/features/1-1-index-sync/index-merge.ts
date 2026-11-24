import type { IndexedScreen, TeamIndex, TeamPage } from "../../lib/types";
import { canonicalTeam, screenIdentity } from "../../lib/screen-identity";
import { PD_FILE_KEY, TEAM_PAGE_NODE_IDS } from "./config";
import { isAllowedSource } from "./file-registry";
import { isDescriptionFrame } from "./screen-rules";

/** 읽을 때만 과거 어드민 데이터를 합친다. 기존 저장 키는 지우거나 변경하지 않는다. */
export function mergeLegacyIndexes(team: TeamPage, current?: TeamIndex, admin?: TeamIndex): TeamIndex | undefined {
  if (!current && !admin) return undefined;
  const scope = canonicalTeam(team);
  const screens = new Map<string, IndexedScreen>();
  const descriptionExcluded: TeamIndex["excluded"] = [];
  for (const index of [admin, current]) {
    for (const screen of index?.screens ?? []) {
      if (canonicalTeam(screen.teamPage) !== scope || !isAllowedSource(scope, screen.fileKey)) continue;
      if (isDescriptionFrame(screen.name, screen.section)) {
        descriptionExcluded.push({ id: screen.id, fileKey: screen.fileKey, sourceId: screen.sourceId, name: screen.name, reason: "Description 설명판은 검색 화면에서 제외" });
        continue;
      }
      const originalTeam = screen.originalTeam ?? screen.teamPage;
      if (canonicalTeam(originalTeam) !== scope) continue;
      if (screen.fileKey === PD_FILE_KEY && screen.pageId && screen.pageId !== TEAM_PAGE_NODE_IDS[originalTeam]) continue;
      screens.set(screenIdentity(screen), { ...screen, teamPage: scope, originalTeam,
        sourceId: screen.sourceId ?? (screen.fileKey === PD_FILE_KEY ? `archive:${originalTeam}` : screen.fileKey),
        pageId: screen.pageId ?? (screen.fileKey === PD_FILE_KEY ? TEAM_PAGE_NODE_IDS[originalTeam] : undefined) });
    }
  }
  return { team: scope, syncedAt: current?.syncedAt ?? admin!.syncedAt, screens: [...screens.values()],
    excluded: [...(current?.excluded ?? []), ...(admin?.excluded ?? []), ...descriptionExcluded], files: current?.files };
}
