import "client-only";

import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS_API, GEMINI_GENERATION_DEFAULTS, GEMINI_STORE } from "../gemini-config";
import { readSafeGeminiHttpError } from "../gemini-http-error";
import { INTERPRET_SCHEMA, INTERPRET_REQUEST_SCHEMA, validateGeminiSchema } from "../gemini-schema";

export interface ConnectionDiagnosticResult {
  stage: "A" | "B" | "C" | "D";
  httpStatus: number | null;
  success: boolean;
  googleCode: number | null;
  googleStatus: string | null;
  fields: string[];
}
const SIMPLE_SCHEMA = { type: "object" as const, properties: { value: { type: "string" as const } }, required: ["value"], additionalProperties: false as const };
const STAGES = ["A", "B", "C", "D"] as const;
// 실제 데이터·검색어·인덱스를 받지 않는 고정 입력이다.
const TEST_INPUT = "시험 입력을 주어진 응답 형식으로 표현하세요.";

/** 명시적 버튼 조작에서만 실행한다. 단계별 한 번, 첫 실패에서 중단하며 재시도하지 않는다. */
export async function runConnectionDiagnostic({ apiKey, signal, onResult, mode = "all" }: {
  apiKey: string; signal?: AbortSignal; onResult?: (result: ConnectionDiagnosticResult) => void; mode?: "all" | "D-only";
}, fetcher: typeof fetch = fetch): Promise<ConnectionDiagnosticResult[]> {
  if (process.env.NODE_ENV !== "development") throw new Error("개발 환경에서만 실행할 수 있습니다.");
  if (!apiKey.trim()) throw new Error("개인 Gemini API 키가 설정되지 않았습니다.");
  const results: ConnectionDiagnosticResult[] = [];
  for (const stage of mode === "D-only" ? ["D"] as const : STAGES) {
    if (signal?.aborted) break;
    const result: ConnectionDiagnosticResult = { stage, httpStatus: null, success: false, googleCode: null, googleStatus: null, fields: [] };
    try {
      const response = await fetcher(`${GEMINI_MODELS_API}/${encodeURIComponent(DEFAULT_GEMINI_MODEL)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey.trim() },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: TEST_INPUT }] }], store: GEMINI_STORE,
          generationConfig: { ...GEMINI_GENERATION_DEFAULTS, maxOutputTokens: 1024,
            ...(stage === "A" ? {} : { responseMimeType: "application/json" }),
            ...(stage === "C" ? { responseJsonSchema: SIMPLE_SCHEMA } : stage === "D" ? { responseJsonSchema: INTERPRET_REQUEST_SCHEMA } : {}),
          },
        }), cache: "no-store", signal,
      });
      result.httpStatus = response.status;
      if (!response.ok) {
        const safe = await readSafeGeminiHttpError(response, signal);
        result.googleCode = safe.code; result.googleStatus = safe.status; result.fields = safe.fields;
      } else {
        const body = await response.json();
        const candidate = Array.isArray(body?.candidates) ? body.candidates[0] : undefined;
        const parts = candidate?.content?.parts;
        const text = Array.isArray(parts) ? parts.filter(p => p?.thought !== true && typeof p?.text === "string").map(p => p.text).join("").trim() : "";
        if (candidate?.finishReason === "STOP" && text) {
          if (stage !== "A") {
            const value: unknown = JSON.parse(text);
            if (stage === "C") validateGeminiSchema(value, SIMPLE_SCHEMA, "interpret");
            if (stage === "D") validateGeminiSchema(value, INTERPRET_SCHEMA, "interpret");
          }
          result.success = true;
        }
      }
    } catch {
      // 예외 원문에는 요청·응답 정보가 있을 수 있어 표시하거나 보관하지 않는다.
    }
    results.push(result);
    onResult?.({ ...result, fields: [...result.fields] });
    if (!result.success) break;
  }
  return results;
}
