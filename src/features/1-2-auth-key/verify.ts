import "client-only";

/** 1-2 연결 확인: 팀 비밀번호는 서버에서, 개인 Gemini 키는 Gemini에서 직접 확인합니다. 키는 저장하지 않고 요청 헤더에만 넣습니다. */

/** 팀 비밀번호를 서버에서 확인합니다. (비밀번호만 확인하는 가벼운 요청) */
export async function verifyTeamPassword(password: string): Promise<void> {
  const response = await fetch("/api/figma-token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-team-password": password },
    body: JSON.stringify({ action: "status" }),
    cache: "no-store",
  });
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `팀 비밀번호를 확인하지 못했어요. (${response.status})`);
}

/** 개인 Gemini API 키가 쓸 수 있는 키인지 모델 목록 요청으로 확인합니다. (생성 요청이 아니라 무료 한도를 쓰지 않습니다.) */
export async function verifyGeminiKey(apiKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      headers: { "x-goog-api-key": apiKey },
      cache: "no-store",
    });
  } catch {
    throw new Error("Gemini에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }
  if (response.ok) return;
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new Error("Gemini API 키가 올바르지 않거나 사용할 권한이 없어요.");
  }
  throw new Error(`Gemini 키를 확인하지 못했어요. (${response.status})`);
}
