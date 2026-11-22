import type { TeamIndex, TeamPage } from "../../lib/types";
import { canonicalTeam } from "../../lib/screen-identity";
import { isAllowedSource } from "./file-registry";

/** 미리보기는 등록 파일이면서 해당 팀의 실제 인덱스에 있는 프레임만 허용한다. */
export function canPreview(index: TeamIndex | undefined, team: TeamPage, fileKey: string, nodeId: string) {
  const scope = canonicalTeam(team);
  return Boolean(index && canonicalTeam(index.team) === scope && isAllowedSource(scope, fileKey)
    && index.screens.some((s) => canonicalTeam(s.teamPage) === scope && s.fileKey === fileKey && s.id === nodeId));
}
