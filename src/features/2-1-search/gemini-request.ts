import "client-only";

import { GeminiSearchError, type GeminiStage } from "./gemini-error";
import { parseGeminiJson } from "./gemini-validation";
import { readSafeGeminiHttpError } from "./gemini-http-error";
import { GEMINI_MODELS_API, GEMINI_GENERATION_DEFAULTS, GEMINI_STORE } from "./gemini-config";
import { requestWith503Retry, type RetryEvents } from "./gemini-retry";
import { withGeminiDeadline } from "./gemini-deadline";

const FINISH_REASONS = new Set(["STOP", "MAX_TOKENS", "SAFETY", "RECITATION", "LANGUAGE", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALFORMED_FUNCTION_CALL", "IMAGE_SAFETY", "UNEXPECTED_TOOL_CALL", "TOO_MANY_TOOL_CALLS", "NO_IMAGE", "FINISH_REASON_UNSPECIFIED"]);

/** 브라우저 어댑터의 통신 처리. 테스트는 fetch를 바꿔 외부 연결 없이 실행한다. */
interface GeminiRequest {
  apiKey: string; model: string; stage: GeminiStage; systemInstruction: string; input: string; signal?: AbortSignal;
  timeoutMs?: number;
  fallbackModel?: string;
}
export async function requestGeminiJson(args: GeminiRequest & RetryEvents, fetcher: typeof fetch = fetch) {
  return withGeminiDeadline(args.stage, args.signal,
    signal => requestWithinDeadline({ ...args, signal }, fetcher), args.timeoutMs);
}

async function requestWithinDeadline({ apiKey, model, fallbackModel, stage, systemInstruction, input, signal, onRequest, onRetry }: GeminiRequest & RetryEvents,
  fetcher: typeof fetch): Promise<{ value: unknown; httpStatus: number; finishReason: string | null; model: string }> {
  const requestBody = JSON.stringify({ systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: input }] }],
    generationConfig: { responseMimeType: "application/json", ...GEMINI_GENERATION_DEFAULTS }, store: GEMINI_STORE });
  if (new TextEncoder().encode(requestBody).length > 300_000) {
    throw new GeminiSearchError("payload", stage, "Gemini 요청 크기 한도를 초과해 전송하지 않았어요. 검색어를 나눠 주세요.");
  }
  let response: Response;
  let usedModel = model;
  try {
    response = await requestWith503Retry(attempt => {
      usedModel = attempt > 0 && fallbackModel ? fallbackModel : model;
      return fetcher(`${GEMINI_MODELS_API}/${encodeURIComponent(usedModel)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: requestBody, cache: "no-store", signal,
      });
    }, { signal, onRequest, onRetry });
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new GeminiSearchError("network", stage, "Gemini에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
  }
  if (!response.ok) {
    const apiError = await readSafeGeminiHttpError(response, signal);
    const message = response.status === 401 || response.status === 403 ? "개인 Gemini API 키 또는 사용 권한을 확인해 주세요."
      : response.status === 429 ? "Gemini 요청 한도 또는 할당량을 초과했어요. 잠시 후 다시 시도해 주세요."
      : response.status === 503 && usedModel !== model ? "기본 모델과 대체 모델이 모두 일시적으로 응답하지 않아요. 잠시 후 다시 검색해 주세요."
      : response.status >= 500 ? "Gemini 서비스가 일시적으로 응답하지 않아요. 잠시 후 다시 시도해 주세요."
      : "Gemini API가 요청을 거부했어요. 요청 설정과 키의 사용 권한을 확인해 주세요.";
    throw new GeminiSearchError("http-api", stage, `${message} (HTTP ${response.status})`, apiError.fields[0] ?? null, response.status, null, apiError);
  }
  let rawBody: string;
  try { rawBody = await response.text(); }
  catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new GeminiSearchError("network", stage, "Gemini 응답을 받는 중 연결이 끊겼어요.", null, response.status);
  }
  if (!rawBody.trim()) throw new GeminiSearchError("empty", stage, "Gemini HTTP 응답 본문이 비어 있어요.", "$response", response.status);
  let body;
  try { body = JSON.parse(rawBody); }
  catch { throw new GeminiSearchError("json", stage, "Gemini HTTP 응답을 JSON으로 읽지 못했어요.", "$response", response.status); }
  const candidate = Array.isArray(body?.candidates) ? body.candidates[0] : undefined;
  const rawFinish = candidate?.finishReason;
  const finishReason = typeof rawFinish === "string" ? (FINISH_REASONS.has(rawFinish) ? rawFinish : "UNRECOGNIZED") : null;
  const parts = candidate?.content?.parts;
  if (parts !== undefined && !Array.isArray(parts)) throw new GeminiSearchError("schema", stage, "Gemini 응답의 parts는 배열이어야 합니다.", "candidates[0].content.parts", response.status, finishReason);
  const texts: string[] = [];
  for (const [i, part] of (parts ?? []).entries()) {
    if (part === null || typeof part !== "object" || (part.text !== undefined && typeof part.text !== "string")) {
      throw new GeminiSearchError("schema", stage, "Gemini 응답의 텍스트 필드 형식이 올바르지 않습니다.", `candidates[0].content.parts[${i}].text`, response.status, finishReason);
    }
    if (part.thought !== true && typeof part.text === "string") texts.push(part.text);
  }
  const text = texts.join("").trim();
  if (!text) throw new GeminiSearchError("empty", stage, "Gemini가 검색 응답 텍스트를 돌려주지 않았어요. 차단 또는 종료 사유를 확인해 주세요.", "candidates[0].content.parts", response.status, finishReason);
  if (finishReason !== null && finishReason !== "STOP") throw new GeminiSearchError("http-api", stage, "Gemini가 응답을 정상적으로 완료하지 못했어요. 종료 사유를 확인해 주세요.", null, response.status, finishReason);
  try { return { value: parseGeminiJson(text), httpStatus: response.status, finishReason, model: usedModel }; }
  catch { throw new GeminiSearchError("json", stage, "Gemini가 검색 결과를 올바른 JSON 형식으로 돌려주지 않았어요.", "$", response.status, finishReason); }
}
