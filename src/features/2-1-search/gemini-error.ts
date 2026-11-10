/** 응답을 저장하거나 로그에 쓰지 않고, 화면에 필요한 오류 설명만 만듭니다. */
export function describeGeminiError(body: unknown, apiKey: string): string {
  if (!body || typeof body !== "object" || !("error" in body)) return "";
  const error = body.error;
  if (!error || typeof error !== "object") return "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const status = "status" in error && typeof error.status === "string" && /^[A-Z_]+$/.test(error.status) ? error.status : "";
  let safe = apiKey ? message.split(apiKey).join("[키 숨김]") : message;
  safe = safe.replace(/AIza[\w-]+/g, "[키 숨김]").replace(/https?:\/\/\S+/g, "[주소 숨김]").slice(0, 600);
  const hint = /API key not valid|API_KEY_INVALID|key expired/i.test(message)
    ? "Google이 API 키를 유효하지 않은 키로 판단했습니다. AI Studio에서 전체 키를 다시 복사해 입력해 주세요."
    : /location|country|region/i.test(message)
      ? "Google이 현재 접속 위치 또는 지역의 API 사용을 제한했습니다. VPN 사용 여부와 AI Studio의 계정 안내를 확인해 주세요."
      : /Unknown name|Invalid JSON|Unknown field/i.test(message)
        ? "Google이 요청의 일부 항목을 지원하지 않습니다. 아래 상세 이유를 확인해 주세요."
        : "";
  return [hint, status, safe].filter(Boolean).join(" · ");
}
