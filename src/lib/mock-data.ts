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

/* 앱 */

const loginMo: IndexedScreen = {
  id: "300:1",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "앱",
  section: "로그인",
  name: "W375/MO/로그인",
  texts: ["다시 만나서 반가워요", "이메일", "비밀번호", "로그인", "비밀번호를 잊으셨나요?"],
  components: [
    { name: "TextField", variant: "default", isMds: true, mdsVersion: "v2" },
    { name: "Button", variant: "primary", isMds: true, mdsVersion: "v2" },
    { name: "TextButton", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/text/primary", "color/bg/brand", "spacing/16", "radius/8"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=300-1",
  syncedAt: "2026-10-15T00:00:00.000Z",
};

const loginPc: IndexedScreen = {
  ...loginMo,
  id: "300:2",
  name: "W1920/PC/로그인",
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=300-2",
};

const myPageMo: IndexedScreen = {
  id: "300:3",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "앱",
  section: "마이",
  name: "W375/MO/마이페이지_기본",
  texts: ["내 활동", "작성한 글", "저장한 글", "설정", "로그아웃"],
  components: [
    { name: "Avatar", variant: "large", isMds: true, mdsVersion: "v2" },
    { name: "ListItem", variant: "chevron", isMds: true, mdsVersion: "v2" },
    { name: "Divider", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/text/primary", "color/border/subtle", "spacing/20"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=300-3",
  syncedAt: "2026-10-15T00:00:00.000Z",
};

const notificationListMo: IndexedScreen = {
  id: "300:4",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "앱",
  section: "알림",
  name: "W375/MO/알림_목록",
  texts: ["알림", "모두 읽음", "회원님의 글에 댓글이 달렸어요", "3분 전"],
  components: [
    { name: "TopNavigation", isMds: true, mdsVersion: "v2" },
    { name: "ListItem", variant: "avatar", isMds: true, mdsVersion: "v2" },
    { name: "Badge", variant: "dot", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/text/secondary", "color/bg/subtle", "spacing/12"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=300-4",
  syncedAt: "2026-10-15T00:00:00.000Z",
};

const notificationEmptyMo: IndexedScreen = {
  id: "300:5",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "앱",
  section: "알림",
  name: "W375/MO/알림_Empty",
  texts: ["알림", "새로운 알림이 없어요"],
  components: [
    { name: "TopNavigation", isMds: true, mdsVersion: "v2" },
    { name: "EmptyState", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/text/secondary", "spacing/24"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=300-5",
  syncedAt: "2026-10-15T00:00:00.000Z",
};

const searchNoResultMo: IndexedScreen = {
  id: "300:6",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "앱",
  section: "검색",
  name: "W375/MO/검색_결과없음",
  texts: ["'디자인 시스템'에 대한 검색 결과가 없어요", "다른 검색어를 입력해 보세요"],
  components: [
    { name: "SearchField", isMds: true, mdsVersion: "v2" },
    { name: "EmptyState", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/text/secondary", "color/bg/subtle", "spacing/24"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=300-6",
  syncedAt: "2026-10-15T00:00:00.000Z",
};

const notificationSettingMo: IndexedScreen = {
  id: "300:7",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "앱",
  section: "설정",
  name: "W375/MO/설정_알림설정",
  texts: ["알림 설정", "댓글 알림", "좋아요 알림", "마케팅 정보 수신"],
  components: [
    { name: "ListItem", variant: "toggle", isMds: true, mdsVersion: "v2" },
    { name: "Toggle", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/bg/brand", "color/border/subtle", "spacing/16"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=300-7",
  syncedAt: "2026-10-15T00:00:00.000Z",
};

const postDetailMo: IndexedScreen = {
  id: "300:8",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "앱",
  section: "홈",
  name: "W375/MO/게시물_상세",
  texts: ["좋아요 12", "댓글 4", "공유하기", "댓글을 남겨 보세요"],
  components: [
    { name: "TopNavigation", isMds: true, mdsVersion: "v2" },
    { name: "Avatar", variant: "small", isMds: true, mdsVersion: "v2" },
    { name: "IconButton", isMds: true, mdsVersion: "v1" },
    { name: "TextField", variant: "default", isMds: true, mdsVersion: "v1" },
  ],
  tokens: ["color/text/primary", "color/text/secondary", "spacing/16"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=300-8",
  syncedAt: "2026-10-15T00:00:00.000Z",
};

/* 플그 */

const communityFeedMo: IndexedScreen = {
  id: "400:1",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "플그",
  section: "커뮤니티",
  name: "W375/MO/커뮤니티_피드",
  texts: ["전체", "인기", "질문", "새 글 쓰기"],
  components: [
    { name: "Tab", variant: "line", isMds: true, mdsVersion: "v1" },
    { name: "Card", variant: "post", isMds: true, mdsVersion: "v1" },
    { name: "FloatingButton", isMds: true, mdsVersion: "v1" },
  ],
  tokens: ["color/bg/default", "color/border/default", "spacing/12"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=400-1",
  syncedAt: "2026-10-14T00:00:00.000Z",
};

const communityFeedPc: IndexedScreen = {
  ...communityFeedMo,
  id: "400:2",
  name: "W1920/PC/커뮤니티_피드",
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=400-2",
};

const postWrite: IndexedScreen = {
  id: "400:3",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "플그",
  section: "커뮤니티",
  name: "Frame 2609101",
  texts: ["글쓰기", "제목을 입력하세요", "내용을 입력하세요", "사진 추가", "등록"],
  components: [
    { name: "TextField", variant: "default", isMds: true, mdsVersion: "v1" },
    { name: "TextArea", isMds: true, mdsVersion: "v1" },
    { name: "ImageUploader", library: "플그 로컬 컴포넌트", isMds: false },
    { name: "Button", variant: "primary", isMds: true, mdsVersion: "v1" },
  ],
  tokens: ["color/border/default", "spacing/16"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=400-3",
  syncedAt: "2026-10-14T00:00:00.000Z",
};

const profileEditMo: IndexedScreen = {
  id: "400:4",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "플그",
  section: "프로필",
  name: "W375/MO/프로필_편집",
  texts: ["프로필 편집", "닉네임", "한 줄 소개", "저장"],
  components: [
    { name: "Avatar", variant: "large", isMds: true, mdsVersion: "v2" },
    { name: "TextField", variant: "default", isMds: true, mdsVersion: "v2" },
    { name: "Button", variant: "primary", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/text/primary", "color/border/default", "spacing/20"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=400-4",
  syncedAt: "2026-10-14T00:00:00.000Z",
};

const reportSheetMo: IndexedScreen = {
  id: "400:5",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "플그",
  section: "커뮤니티",
  name: "W375/MO/신고하기_바텀시트",
  texts: ["신고 사유를 선택해 주세요", "스팸·광고", "욕설·비방", "기타", "신고하기"],
  components: [
    { name: "BottomSheet", isMds: true, mdsVersion: "v2" },
    { name: "Radio", isMds: true, mdsVersion: "v2" },
    { name: "Button", variant: "danger", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/bg/danger", "color/text/primary", "radius/16"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=400-5",
  syncedAt: "2026-10-14T00:00:00.000Z",
};

const commentDeleteConfirm: IndexedScreen = {
  id: "400:6",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "플그",
  section: "커뮤니티",
  name: "W375/MO/댓글_삭제확인",
  texts: ["댓글을 삭제할까요?", "삭제한 댓글은 되돌릴 수 없어요", "취소", "삭제"],
  components: [
    { name: "Dialog", isMds: true, mdsVersion: "v1" },
    { name: "Button", variant: "subtle", isMds: true, mdsVersion: "v1" },
    { name: "Button", variant: "danger", isMds: true, mdsVersion: "v1" },
  ],
  tokens: ["color/bg/danger", "radius/12"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=400-6",
  syncedAt: "2026-10-14T00:00:00.000Z",
};

/* 크루 */

const crewHomeMo: IndexedScreen = {
  id: "500:1",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "크루",
  section: "크루 홈",
  name: "W375/MO/크루_홈",
  texts: ["내 크루", "추천 크루", "크루 만들기", "이번 주 모임 2개"],
  components: [
    { name: "Card", variant: "crew", isMds: true, mdsVersion: "v2" },
    { name: "Chip", isMds: true, mdsVersion: "v2" },
    { name: "Button", variant: "primary", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/bg/subtle", "color/text/primary", "spacing/16"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=500-1",
  syncedAt: "2026-10-13T00:00:00.000Z",
};

const crewCreateStep1Mo: IndexedScreen = {
  id: "500:2",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "크루",
  section: "크루 만들기",
  name: "W375/MO/크루_만들기_1단계",
  texts: ["어떤 크루를 만들까요?", "크루 이름", "카테고리 선택", "다음"],
  components: [
    { name: "ProgressBar", variant: "step", isMds: true, mdsVersion: "v2" },
    { name: "TextField", variant: "default", isMds: true, mdsVersion: "v2" },
    { name: "Chip", variant: "selectable", isMds: true, mdsVersion: "v2" },
    { name: "Button", variant: "primary", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/bg/brand", "color/border/default", "spacing/24"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=500-2",
  syncedAt: "2026-10-13T00:00:00.000Z",
};

const crewCreateStep2Mo: IndexedScreen = {
  id: "500:3",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "크루",
  section: "크루 만들기",
  name: "W375/MO/크루_만들기_2단계",
  texts: ["크루를 소개해 주세요", "대표 이미지", "소개글", "크루 만들기"],
  components: [
    { name: "ProgressBar", variant: "step", isMds: true, mdsVersion: "v2" },
    { name: "ImageUploader", library: "크루 로컬 컴포넌트", isMds: false },
    { name: "TextArea", isMds: true, mdsVersion: "v2" },
    { name: "Button", variant: "primary", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/bg/brand", "color/border/default", "spacing/24"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=500-3",
  syncedAt: "2026-10-13T00:00:00.000Z",
};

const crewMemberListMo: IndexedScreen = {
  id: "500:4",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "크루",
  section: "크루 관리",
  name: "W375/MO/크루_멤버목록",
  texts: ["멤버 24명", "크루장", "운영진", "내보내기"],
  components: [
    { name: "ListItem", variant: "avatar", isMds: true, mdsVersion: "v1" },
    { name: "Badge", variant: "label", isMds: true, mdsVersion: "v1" },
    { name: "IconButton", isMds: true, mdsVersion: "v1" },
  ],
  tokens: ["color/text/secondary", "color/border/subtle", "spacing/12"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=500-4",
  syncedAt: "2026-10-13T00:00:00.000Z",
};

const crewInviteEmptyMo: IndexedScreen = {
  id: "500:5",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "크루",
  section: "크루 관리",
  name: "W375/MO/크루_초대_Empty",
  texts: ["아직 받은 초대가 없어요", "관심 있는 크루를 둘러보세요", "크루 둘러보기"],
  components: [
    { name: "EmptyState", isMds: true, mdsVersion: "v2" },
    { name: "Button", variant: "subtle", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/text/secondary", "spacing/24"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=500-5",
  syncedAt: "2026-10-13T00:00:00.000Z",
};

const crewSchedule: IndexedScreen = {
  id: "500:6",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "크루",
  name: "Frame 2611230",
  texts: ["10월 일정", "정기 모임", "참석", "불참"],
  components: [
    { name: "CustomCalendar", library: "크루 로컬 컴포넌트", isMds: false },
    { name: "Button", variant: "subtle", isMds: true, mdsVersion: "v1" },
  ],
  tokens: ["color/bg/brand", "color/text/primary"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=500-6",
  syncedAt: "2026-10-13T00:00:00.000Z",
};

/* 공홈 */

const mainPc: IndexedScreen = {
  id: "600:1",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "공홈",
  section: "메인",
  name: "W1920/PC/메인",
  texts: ["함께 만드는 즐거움", "서비스 소개", "지금 시작하기", "자주 묻는 질문"],
  components: [
    { name: "GNB", library: "공홈 로컬 컴포넌트", isMds: false },
    { name: "Button", variant: "primary", isMds: true, mdsVersion: "v2" },
    { name: "Accordion", isMds: true, mdsVersion: "v2" },
    { name: "Footer", library: "공홈 로컬 컴포넌트", isMds: false },
  ],
  tokens: ["color/bg/brand", "color/text/inverse", "spacing/80"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=600-1",
  syncedAt: "2026-10-12T00:00:00.000Z",
};

const mainMo: IndexedScreen = {
  ...mainPc,
  id: "600:2",
  name: "W375/MO/메인",
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=600-2",
};

const careerListPc: IndexedScreen = {
  id: "600:3",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "공홈",
  section: "채용",
  name: "W1920/PC/채용_목록",
  texts: ["채용 중인 포지션", "프로덕트 디자이너", "프론트엔드 개발자", "지원하기"],
  components: [
    { name: "GNB", library: "공홈 로컬 컴포넌트", isMds: false },
    { name: "Tab", variant: "pill", isMds: true, mdsVersion: "v2" },
    { name: "Card", variant: "job", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/text/primary", "color/border/subtle", "spacing/32"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=600-3",
  syncedAt: "2026-10-12T00:00:00.000Z",
};

const contactDonePc: IndexedScreen = {
  id: "600:4",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "공홈",
  section: "문의하기",
  name: "W1920/PC/문의하기_완료",
  texts: ["문의가 접수되었어요", "영업일 기준 3일 안에 답변 드릴게요", "메인으로 가기"],
  components: [
    { name: "Icon", variant: "check-circle", isMds: true, mdsVersion: "v2" },
    { name: "Button", variant: "primary", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/icon/success", "color/text/secondary", "spacing/40"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=600-4",
  syncedAt: "2026-10-12T00:00:00.000Z",
};

const notFoundPc: IndexedScreen = {
  id: "600:5",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "공홈",
  section: "에러",
  name: "W1920/PC/404",
  texts: ["페이지를 찾을 수 없어요", "주소가 바뀌었거나 삭제된 페이지예요", "메인으로 가기"],
  components: [
    { name: "EmptyState", variant: "error", isMds: true, mdsVersion: "v2" },
    { name: "Button", variant: "subtle", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/text/secondary", "spacing/40"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=600-5",
  syncedAt: "2026-10-12T00:00:00.000Z",
};

/* 어드민 */

const memberListPc: IndexedScreen = {
  id: "700:1",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "어드민",
  section: "회원 관리",
  name: "W1920/PC/회원관리_목록",
  texts: ["회원 관리", "이름 또는 이메일로 검색", "가입일", "상태", "정지"],
  components: [
    { name: "SearchField", isMds: true, mdsVersion: "v1" },
    { name: "Table", isMds: true, mdsVersion: "v1" },
    { name: "Pagination", isMds: true, mdsVersion: "v1" },
    { name: "Badge", variant: "label", isMds: true, mdsVersion: "v1" },
  ],
  tokens: ["color/border/default", "color/text/secondary", "spacing/16"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=700-1",
  syncedAt: "2026-10-11T00:00:00.000Z",
};

const memberDetailPc: IndexedScreen = {
  id: "700:2",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "어드민",
  section: "회원 관리",
  name: "W1920/PC/회원관리_상세",
  texts: ["회원 상세", "기본 정보", "활동 내역", "이용 정지", "메모 남기기"],
  components: [
    { name: "Tab", variant: "line", isMds: true, mdsVersion: "v1" },
    { name: "DescriptionList", library: "어드민 로컬 컴포넌트", isMds: false },
    { name: "Button", variant: "danger", isMds: true, mdsVersion: "v1" },
  ],
  tokens: ["color/bg/danger", "color/border/default", "spacing/24"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=700-2",
  syncedAt: "2026-10-11T00:00:00.000Z",
};

const reportListEmptyPc: IndexedScreen = {
  id: "700:3",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "어드민",
  section: "신고 관리",
  name: "W1920/PC/신고관리_목록_Empty",
  texts: ["신고 관리", "처리할 신고가 없어요"],
  components: [
    { name: "Table", isMds: true, mdsVersion: "v1" },
    { name: "EmptyState", isMds: true, mdsVersion: "v1" },
  ],
  tokens: ["color/text/secondary", "spacing/24"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=700-3",
  syncedAt: "2026-10-11T00:00:00.000Z",
};

const noticeWritePc: IndexedScreen = {
  id: "700:4",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "어드민",
  section: "공지 관리",
  name: "W1920/PC/공지_작성",
  texts: ["공지 작성", "제목", "노출 기간", "상단 고정", "임시 저장", "게시"],
  components: [
    { name: "TextField", variant: "default", isMds: true, mdsVersion: "v2" },
    { name: "DatePicker", isMds: true, mdsVersion: "v2" },
    { name: "Checkbox", isMds: true, mdsVersion: "v2" },
    { name: "RichTextEditor", library: "어드민 로컬 컴포넌트", isMds: false },
    { name: "Button", variant: "primary", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/border/default", "color/bg/brand", "spacing/16"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=700-4",
  syncedAt: "2026-10-11T00:00:00.000Z",
};

const dashboardPc: IndexedScreen = {
  id: "700:5",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "어드민",
  section: "대시보드",
  name: "W1920/PC/대시보드",
  texts: ["오늘 가입자", "주간 활성 사용자", "미처리 신고", "최근 7일"],
  components: [
    { name: "StatCard", library: "어드민 로컬 컴포넌트", isMds: false },
    { name: "LineChart", library: "어드민 로컬 컴포넌트", isMds: false },
    { name: "Select", isMds: true, mdsVersion: "v1" },
  ],
  tokens: ["color/bg/subtle", "color/text/primary", "spacing/24"],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=700-5",
  syncedAt: "2026-10-11T00:00:00.000Z",
};

export const mockIndex: IndexedScreen[] = [
  homeEmptyMo,
  homeEmptyPc,
  commentMention,
  // 앱
  loginMo,
  loginPc,
  myPageMo,
  notificationListMo,
  notificationEmptyMo,
  searchNoResultMo,
  notificationSettingMo,
  postDetailMo,
  // 플그
  communityFeedMo,
  communityFeedPc,
  postWrite,
  profileEditMo,
  reportSheetMo,
  commentDeleteConfirm,
  // 크루
  crewHomeMo,
  crewCreateStep1Mo,
  crewCreateStep2Mo,
  crewMemberListMo,
  crewInviteEmptyMo,
  crewSchedule,
  // 공홈
  mainPc,
  mainMo,
  careerListPc,
  contactDonePc,
  notFoundPc,
  // 어드민
  memberListPc,
  memberDetailPc,
  reportListEmptyPc,
  noticeWritePc,
  dashboardPc,
];

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
