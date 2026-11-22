import type { SearchTeam, TeamPage } from "../../lib/types";
import { canonicalTeam } from "../../lib/screen-identity";
import { PD_FILE_KEY, TEAM_PAGE_NODE_IDS } from "./config";

export interface FileSource {
  sourceId: string;
  team: SearchTeam;
  fileKey: string;
  name: string;
  folderId?: string;
  url: string;
  /** 아카이브만 특정 페이지로 제한. 작업 파일은 모든 페이지를 탐색한다. */
  pageIds?: string[];
  originalTeam?: TeamPage;
  role: "service-or-review" | "library-review" | "archive";
}
export const TEAM_FOLDERS: Record<SearchTeam, string> = { 앱: "66953900", 플그: "66945100", 크루: "66953919", 공홈: "343573998" };

// 2026-11-22 로그인된 Figma 파일 브라우저에서 소속 폴더·링크 확인.
// 파일명은 탐색 제외 조건이 아니다. 현재 작업실도 포함하며 완료 상태는 추정하지 않는다.
const files: Record<SearchTeam, [string, string][]> = {
  앱: [
    ["Hbwppk3hFZm1jq7GuclyXG", "[39기] APP handoff"],
    ["6ztRwsGgpR9goEO5gByDeI", "[39기] APP 디자인 작업공간"],
    ["UtTF1EsyHamdiHR7ElEMnM", "[39기] APP 기획 작업공간"],
    ["KdS3GTS17fay80EFqdiC3C", "[통합-02] NEW APP ver.2"],
    ["766PR16QR3JHZ66lzJLOqg", "드폰이애용"],
    ["PADBMG0MYFWWRPNm9yccOL", "[통합-01] 지옥에서 돌아온 앱팀"],
    ["q0EeAg3ZLGISON1hY1CIn7", "[3기] APP 회의용"],
    ["l8DLiTnn9T9qekAnVTC0bW", "[35기] APP Team 화면설계서"],
    ["y776uloSMPeflr547bQt4m", "콕찌르기 프로토타입 전달"],
    ["7gKso7MLlPKDOu0qnRLvKF", "[01] 기디 논의의 장소"],
  ],
  플그: [
    ["croueQo0peccyM6SJabMQw", "39기 플그 디자인 작업실"],
    ["qpUMCNHsgTiiNGTZ5nYih7", "38기 플그 디자인 작업실"],
    ["xAimTiT734vjm91NNi9KhA", "37기 플그 작업실"],
    ["gzWBPKGxL9C9FU1YOh5LXD", "35기 플그 작업실"],
    ["tcG4rJJRstd5sM86tnEkKO", "36기 플그 작업실"],
    ["aHrjZEwpHMDoPTTmx4UuW7", "38기 플그 기능명세서"],
    ["kMZy2bHzlnH1Bgs4Wf6xq5", "4기 플그 작업실"],
    ["V7uZwrEootiPCJxagf3pTY", "37기 플그 기능명세서"],
    ["wmicktQOGHgfi7EwYx7QgB", "36기 플그 기능명세서"],
    ["wjvSOF4fZ7dGSwrtxoXZrb", "2기 플그 작업실"],
    ["DYKpqg3s0pVxa3RFQHR8nq", "35기 화면설계서"],
    ["vaagJX2aB6r22r6SFtaHI0", "3기 플그 작업실"],
    ["bNku2EqzznoG4SOgLrpVMT", "1기 플그 작업실"],
    ["xFRIsom1QS6JNLv1X3ueoL", "2기 플그 작업실 (수현 draft)"],
  ],
  크루: [
    ["Zvf03tpgMRTn5ML9KaqmRh", "[39기] CREW hand-off"],
    ["XYZ92IxTABvzuzov0Cf5qu", "🩴 [38기] 크루 Hand-Off"],
    ["laoAmS0Q1tbkcxXu55P6vi", "프로덕트 관련 문서 모음"],
    ["PmvfnAo1HmOaXhSzrmRltr", "[CREW] 전체 UI 모음"],
    ["c2a4IIxM95loMQypvRTioh", "🦖 [36기] 크루 Handoff"],
    ["fSfHdteqQjxCF9Lk8orcjt", "🥐 [37기] 크루 Handoff"],
    ["McjBYsB63nhFSqiFhdSF1S", "[35기] 크루 Handoff"],
    ["UeMDvLaTa9MDLRPwzA4UmQ", "[History] Crew HandOff History"],
    ["RSjJp1orz5wm395KUxObQp", "기디기디"],
    ["N3BEo7ZuaQAiopaoTsGOvI", "(mds 등장으로 폐쇄) Crewya Design System"],
  ],
  공홈: [
    ["aFJhoF5NN7HnSgRPLg5VeN", "39기 공홈팀 작업실"],
    ["MyVs5YHGCOZBoaH0bIRtFJ", "38기 공홈팀 작업실"],
    ["vQrKzAR6nrVMmcJ5brCZ0H", "37기 어드민팀 작업실"],
    ["wQRUlMHjwFgWEvQs5tvEFO", "🛠️ 36기 어드민팀 작업실"],
    ["TEkv077T4CYnwqOZecTUw1", "🗃️ 아카이빙"],
  ],
};

export function getFileSources(team: TeamPage): FileSource[] {
  const scope = canonicalTeam(team);
  const archives: TeamPage[] = scope === "공홈" ? ["공홈", "어드민"] : [scope];
  return [
    ...archives.map((originalTeam): FileSource => ({ sourceId: `archive:${originalTeam}`, team: scope,
      fileKey: PD_FILE_KEY, name: "[PD] 문서 모음", pageIds: [TEAM_PAGE_NODE_IDS[originalTeam]], originalTeam,
      role: "archive", url: `https://www.figma.com/design/${PD_FILE_KEY}/` })),
    ...files[scope].map(([fileKey, name]): FileSource => ({ sourceId: fileKey, team: scope, fileKey, name,
      folderId: TEAM_FOLDERS[scope], url: `https://www.figma.com/design/${fileKey}/`,
      originalTeam: ["vQrKzAR6nrVMmcJ5brCZ0H", "wQRUlMHjwFgWEvQs5tvEFO"].includes(fileKey) ? "어드민" : undefined,
      role: fileKey === "N3BEo7ZuaQAiopaoTsGOvI" ? "library-review" : "service-or-review" })),
  ];
}

/** 클라이언트 입력으로 레지스트리 밖의 임의 파일을 읽지 않는다. */
export function isAllowedSource(team: TeamPage, fileKey: string) {
  return getFileSources(team).some((source) => source.fileKey === fileKey);
}
