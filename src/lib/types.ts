/**
 * 기능끼리 주고받는 공통 데이터 형식입니다.
 * 형식을 바꿀 때는 팀 채널에서 먼저 합의합니다. (AGENTS.md 참고)
 */

/** 검색 대상 팀 페이지 */
export type TeamPage = "앱" | "플그" | "크루" | "공홈" | "어드민";

/** 화면에 쓰인 컴포넌트 */
export interface ComponentUsage {
  name: string; // 예: "Button"
  variant?: string; // 예: "subtle"
  library?: string; // 소속 라이브러리 이름
  isMds: boolean; // MDS 컴포넌트인지
  mdsVersion?: "v1" | "v2";
}

/**
 * 화면 속 MDS 컴포넌트 하나 (2-4 MDS 표시가 화면 위에 위치로 보여 준다)
 * MDS가 아닌 컴포넌트(시스템 UI 포함)와 MDS 컴포넌트 안쪽의 컴포넌트는 넣지 않는다.
 */
export interface MdsElement {
  id: string; // Figma 노드 ID
  component: string; // 컴포넌트 이름, 예: "Button_Text"
  variant?: string; // 변형(속성) 값, 예: "State=Default"
  mdsVersion: "v1" | "v2";
  tokens: string[]; // 이 요소에 쓰인 MDS 토큰 이름
  texts: string[]; // 요소 안의 글 (숨겨진 레이어 제외)
  /** 화면 프레임의 왼쪽 위를 기준으로 한 위치와 크기 (px) */
  box: { x: number; y: number; width: number; height: number };
}

/**
 * 검색 인덱스의 화면 하나 (1-1 인덱스 생성 및 동기화가 만든다)
 * 디자인 원본은 저장하지 않고, 찾기 위한 정보만 담는다.
 */
export interface IndexedScreen {
  id: string; // Figma 노드 ID
  fileKey: string; // Figma 파일 키
  teamPage: TeamPage;
  section?: string; // 화면 위의 구역 제목 (예: "커뮤니티")
  name: string; // 프레임 이름
  texts: string[]; // 화면 속 텍스트 (숨겨진 레이어 제외)
  components: ComponentUsage[];
  tokens: string[]; // 쓰인 MDS 토큰 이름
  width?: number; // 화면 프레임 크기 (px). elements의 위치를 화면 이미지에 맞출 때 쓴다.
  height?: number;
  elements?: MdsElement[]; // 화면 속 MDS 컴포넌트와 위치 (2-4 MDS 표시용)
  figmaUrl: string; // 원본 노드 링크
  syncedAt: string; // 동기화 시각 (ISO 문자열)
}

/** Find My Design 판정 규칙 */
export type Verdict = "정답 후보" | "부분 일치";

/** 검색 결과 하나 (2-1 화면 검색이 만들고, 2-2 ~ 3-2가 받아 쓴다) */
export interface SearchResult {
  screen: IndexedScreen;
  verdict: Verdict;
  reasons: string[]; // 이 화면을 찾은 근거
  unmetConditions?: string[]; // 부분 일치일 때 맞지 않은 조건
  summary?: string; // 2-2 화면 정보 표시: 어떤 기능의 화면인지
  otherVersions?: IndexedScreen[]; // 2-3 다른 버전 함께 보기
}

/** 검색 응답. 결과가 비어 있으면 "찾지 못함"으로 표시한다. */
export interface SearchResponse {
  query: string;
  team: TeamPage;
  results: SearchResult[];
}
