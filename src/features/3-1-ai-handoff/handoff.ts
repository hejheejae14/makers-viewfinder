import type { SearchResult } from "../../lib/types";

export const HANDOFF_ACTIONS = [
  {
    id: "find-notion",
    label: "관련 노션 페이지 찾기",
    description: "이 화면과 관련된 기획 문서와 의사결정 기록을 찾아요.",
    request:
      "아래 화면과 관련된 Notion 기획 문서나 의사결정 기록을 찾아 주세요.",
    output:
      "확인한 문서마다 제목, 링크, 관련 이유를 정리해 주세요. 접근이 어렵다면 검색어를 제안해 주세요.",
  },
  {
    id: "create-design",
    label: "이 화면 바탕으로 시안 생성하기",
    description: "기존 화면의 흐름과 컴포넌트를 참고해 새 시안을 구상해요.",
    request: "아래 Figma 화면을 참고해 개선 시안의 초안을 만들어 주세요.",
    output:
      "채팅에서 화면 구성, 주요 동작, 상태별 문구를 제안해 주세요. 확인하기 어려운 부분은 가정으로 표시해 주세요.",
  },
] as const;

export const HANDOFF_PROVIDERS = [
  { id: "chatgpt", label: "ChatGPT", newChatUrl: "https://chatgpt.com/" },
  { id: "claude", label: "Claude", newChatUrl: "https://claude.ai/new" },
] as const;

export type HandoffActionId = (typeof HANDOFF_ACTIONS)[number]["id"];
export type HandoffProviderId = (typeof HANDOFF_PROVIDERS)[number]["id"];

const MAX_HANDOFF_URL_LENGTH = 2_000;

export function buildHandoffPrompt(
  actionId: HandoffActionId,
  { screen, summary }: Pick<SearchResult, "screen" | "summary">,
) {
  const action = HANDOFF_ACTIONS.find(({ id }) => id === actionId)!;
  const components = screen.components.map(({ name, variant, mdsVersion }) => {
    const details = [variant, mdsVersion && `MDS ${mdsVersion}`].filter(Boolean);
    return details.length ? `${name} (${details.join(", ")})` : name;
  });

  return [
    action.request,
    "",
    `- 팀: ${screen.teamPage}`,
    `- 기능: ${summary?.trim() || screen.section?.trim() || screen.name}`,
    `- 화면: ${screen.name}`,
    `- Figma 원본: ${screen.figmaUrl}`,
    `- 컴포넌트: ${components.join(", ") || "확인된 항목 없음"}`,
    "",
    action.output,
  ].join("\n");
}

export function getHandoffUrl(providerId: HandoffProviderId, prompt: string) {
  const provider = HANDOFF_PROVIDERS.find(({ id }) => id === providerId)!;
  const url = new URL(provider.newChatUrl);
  url.searchParams.set("q", prompt);

  return url.href.length <= MAX_HANDOFF_URL_LENGTH ? url.href : null;
}
