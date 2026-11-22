import type { SafeGeminiHttpError } from "./gemini-http-error";

export type GeminiStage = "interpret" | "judge";
export type GeminiErrorKind = "network" | "http-api" | "empty" | "json" | "schema" | "semantic";

/** 브라우저 메모리용 허용 목록. 요청·응답 원문, 키, 헤더는 포함하지 않는다. */
export interface GeminiDiagnostic {
  stage: GeminiStage;
  kind: GeminiErrorKind;
  httpStatus: number | null;
  finishReason: string | null;
  fieldPath: string | null;
  apiError?: SafeGeminiHttpError;
}

export class GeminiSearchError extends Error {
  readonly diagnostic: GeminiDiagnostic;
  constructor(kind: GeminiErrorKind, stage: GeminiStage, message: string, fieldPath: string | null = null,
    httpStatus: number | null = null, finishReason: string | null = null, apiError?: SafeGeminiHttpError) {
    super(message);
    this.name = "GeminiSearchError";
    this.diagnostic = { stage, kind, httpStatus, finishReason, fieldPath };
    if (apiError) this.diagnostic.apiError = apiError;
  }
}

export function attachGeminiContext(error: unknown, stage: GeminiStage, httpStatus: number, finishReason: string | null): GeminiSearchError {
  if (error instanceof GeminiSearchError) {
    return new GeminiSearchError(error.diagnostic.kind, stage, error.message, error.diagnostic.fieldPath, httpStatus, finishReason, error.diagnostic.apiError);
  }
  // 알 수 없는 예외 원문에는 민감한 내용이 있을 수 있으므로 전달하지 않는다.
  return new GeminiSearchError("semantic", stage, "검색 조건 및 의미를 검증하지 못했어요.", null, httpStatus, finishReason);
}
