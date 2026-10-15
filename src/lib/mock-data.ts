import type { IndexedScreen, SearchResult } from "./types";

/**
 * 공통 형식에 맞춘 가짜 데이터입니다.
 * 다른 기능이 완성되기 전까지 각자 이 데이터로 개발합니다.
 */

const homeEmptyMo: IndexedScreen = {
  id: "100:1",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "앱",
  section: "홈",
  name: "W375/MO/홈_Empty",
  texts: ["아직 올라온 게시물이 없어요", "첫 게시물을 남겨 보세요"],
  components: [
    { name: "EmptyState", isMds: true, mdsVersion: "v2" },
    { name: "Button", variant: "subtle", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/text/secondary", "spacing/24"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=100-1",
  syncedAt: "2026-10-15T00:00:00.000Z",
};

const homeEmptyPc: IndexedScreen = {
  ...homeEmptyMo,
  id: "100:2",
  name: "W1920/PC/홈_Empty",
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=100-2",
};

const commentMention: IndexedScreen = {
  id: "200:1",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "플그",
  section: "커뮤니티",
  name: "Frame 2609054",
  texts: ["댓글 달기", "@멘션할 사람을 선택하세요"],
  components: [{ name: "TextField", variant: "default", isMds: true, mdsVersion: "v1" }],
  tokens: ["color/border/default"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=200-1",
  syncedAt: "2026-10-15T00:00:00.000Z",
};

export const mockIndex: IndexedScreen[] = [homeEmptyMo, homeEmptyPc, commentMention];

export const mockResults: SearchResult[] = [
  {
    screen: homeEmptyMo,
    verdict: "정답 후보",
    reasons: ["화면 속 텍스트 '아직 올라온 게시물이 없어요'가 빈 상태를 나타냄", "구역 '홈'에 있음"],
    summary: "앱 홈에서 게시물이 없을 때 보이는 빈 상태 화면",
    otherVersions: [homeEmptyPc],
  },
  {
    screen: commentMention,
    verdict: "부분 일치",
    reasons: ["화면 속 텍스트에 '멘션'이 포함됨"],
    unmetConditions: ["요청한 팀(앱)과 다른 팀(플그)의 화면"],
    summary: "플그 커뮤니티의 댓글 멘션 입력 화면",
  },
];
