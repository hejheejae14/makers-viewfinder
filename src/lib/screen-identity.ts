import type { IndexedScreen, SearchTeam, TeamPage } from "./types";

export const SEARCH_TEAMS: SearchTeam[] = ["앱", "플그", "크루", "공홈"];
export const canonicalTeam = (team: TeamPage): SearchTeam => team === "어드민" ? "공홈" : team;
export const screenIdentity = (screen: Pick<IndexedScreen, "fileKey" | "id">) => `${screen.fileKey}/${screen.id}`;
