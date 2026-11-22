import { INTERPRET_SCHEMA, JUDGE_SCHEMA } from "./gemini-schema";

export interface SafeGeminiHttpError {
  code: number | null;
  status: string | null;
  reasons: string[];
  fields: string[];
  bodyState: "parsed" | "empty" | "invalid-json" | "unrecognized" | "unreadable" | "oversized";
}
const STATUSES = new Set(["INVALID_ARGUMENT", "FAILED_PRECONDITION", "OUT_OF_RANGE", "UNAUTHENTICATED", "PERMISSION_DENIED", "NOT_FOUND", "ALREADY_EXISTS", "RESOURCE_EXHAUSTED", "CANCELLED", "ABORTED", "INTERNAL", "UNIMPLEMENTED", "UNAVAILABLE", "DEADLINE_EXCEEDED", "UNKNOWN", "DATA_LOSS"]);
const REASONS = new Set(["API_KEY_INVALID", "API_KEY_EXPIRED", "API_KEY_SERVICE_BLOCKED", "API_KEY_HTTP_REFERRER_BLOCKED", "API_KEY_IP_ADDRESS_BLOCKED", "API_KEY_ANDROID_APP_BLOCKED", "API_KEY_IOS_APP_BLOCKED", "SERVICE_DISABLED", "BILLING_DISABLED", "RATE_LIMIT_EXCEEDED", "CONSUMER_INVALID", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"]);
const CODES = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 400, 401, 403, 404, 408, 409, 412, 413, 415, 416, 422, 429, 499, 500, 501, 502, 503, 504]);
const FIELDS = new Set(["model", "contents", "contents.role", "contents.parts", "contents.parts.text", "systemInstruction", "systemInstruction.parts", "systemInstruction.parts.text", "generationConfig", "generationConfig.temperature", "generationConfig.maxOutputTokens", "generationConfig.responseMimeType", "generationConfig.responseJsonSchema", "store"]);
function collectPaths(value: unknown, prefix: string) {
  FIELDS.add(prefix);
  if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
    if (!/^\d+$/.test(key)) collectPaths(child, `${prefix}.${key}`);
  }
}
collectPaths(INTERPRET_SCHEMA, "generationConfig.responseJsonSchema");
collectPaths(JUDGE_SCHEMA, "generationConfig.responseJsonSchema");
const ALIASES: Record<string, string> = { generation_config: "generationConfig", response_json_schema: "responseJsonSchema", response_mime_type: "responseMimeType", max_output_tokens: "maxOutputTokens", system_instruction: "systemInstruction", min_items: "minItems", max_items: "maxItems", min_length: "minLength", additional_properties: "additionalProperties" };
function safeField(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9_.\[\]'" ]+$/.test(value)) return;
  const tokens = value.match(/[A-Za-z_][A-Za-z_0-9]*|\d+/g) ?? [];
  if (tokens.some(token => /^\d+$/.test(token) && Number(token) > 100)) return;
  const path = tokens.filter(token => !/^\d+$/.test(token)).map(token => ALIASES[token] ?? token).join(".");
  return FIELDS.has(path) ? path : undefined;
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const empty = (bodyState: SafeGeminiHttpError["bodyState"]): SafeGeminiHttpError => ({ code: null, status: null, reasons: [], fields: [], bodyState });

/** Google message/description/metadata 원문은 읽어 표시하지 않는다. 허용 목록의 값만 새 객체로 복사한다. */
export function parseSafeGeminiHttpError(text: string): SafeGeminiHttpError {
  if (!text.trim()) return empty("empty");
  if (text.length > 65536) return empty("oversized");
  let body: unknown;
  try { body = JSON.parse(text); } catch { return empty("invalid-json"); }
  if (!record(body) || !record(body.error)) return empty("unrecognized");
  const error = body.error;
  const safe = empty("parsed");
  if (typeof error.code === "number" && CODES.has(error.code)) safe.code = error.code;
  if (typeof error.status === "string" && STATUSES.has(error.status)) safe.status = error.status;
  if (Array.isArray(error.details)) for (const detail of error.details.slice(0, 32)) {
    if (!record(detail)) continue;
    if ((detail["@type"] === undefined || detail["@type"] === "type.googleapis.com/google.rpc.ErrorInfo")
      && typeof detail.reason === "string" && REASONS.has(detail.reason)) safe.reasons.push(detail.reason);
    if ((detail["@type"] === undefined || detail["@type"] === "type.googleapis.com/google.rpc.BadRequest")
      && Array.isArray(detail.fieldViolations)) for (const violation of detail.fieldViolations.slice(0, 32)) {
      const field = record(violation) ? safeField(violation.field) : undefined;
      if (field) safe.fields.push(field);
    }
  }
  safe.reasons = [...new Set(safe.reasons)]; safe.fields = [...new Set(safe.fields)];
  return safe;
}

export async function readSafeGeminiHttpError(response: Response, signal?: AbortSignal): Promise<SafeGeminiHttpError> {
  try { return parseSafeGeminiHttpError(await response.text()); }
  catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
    return empty("unreadable");
  }
}
