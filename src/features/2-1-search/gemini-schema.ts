import { GeminiSearchError, type GeminiStage } from "./gemini-error";

interface JsonSchema {
  type: "object" | "array" | "string";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: false;
  items?: JsonSchema;
  enum?: string[];
  minItems?: number;
  maxItems?: number;
  minLength?: number;
}
const text: JsonSchema = { type: "string", minLength: 1 };
const strings = (minItems = 0, maxItems?: number): JsonSchema => ({ type: "array", items: text, minItems, ...(maxItems === undefined ? {} : { maxItems }) });
const choice = (...values: string[]): JsonSchema => ({ type: "string", enum: values });
const object = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });

/** 브라우저의 엄격 검증 기준. 전송 스키마는 여기서 파생하되 배열 길이 제한만 분리한다. */
export const INTERPRET_SCHEMA: JsonSchema = object({
  conditions: { type: "array", minItems: 1, maxItems: 20, items: object({
    id: text, label: text, aliases: strings(1, 12),
    kind: choice("service", "screen", "function", "state", "component", "property", "platform", "text", "token", "cohort"),
    requirement: choice("must", "should", "exclude"), sourceText: text,
    scope: choice("screen", "region", "element"), relatedTo: { type: "string" },
  }, ["id", "label", "aliases", "kind", "requirement", "sourceText", "scope"]) },
});

/** 중첩 배열의 길이 제한은 생성 문법 상태 수를 늘릴 수 있어 전송에서만 제외한다. */
function withoutArrayBounds(schema: JsonSchema): JsonSchema {
  const copy = { ...schema };
  if (copy.type === "array") { delete copy.minItems; delete copy.maxItems; }
  if (schema.items) copy.items = withoutArrayBounds(schema.items);
  if (schema.properties) copy.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, withoutArrayBounds(value)]));
  return copy;
}
export const INTERPRET_REQUEST_SCHEMA = withoutArrayBounds(INTERPRET_SCHEMA);

export const JUDGE_SCHEMA: JsonSchema = { type: "array", maxItems: 60, items: object({
  screenId: text, verdict: choice("정답 후보", "부분 일치"), reasons: strings(1), unmetConditions: strings(),
  relevance: choice("high", "medium", "low", "irrelevant"),
  checks: { type: "array", minItems: 1, items: object({
    conditionId: text, status: choice("확인됨", "추정", "확인 불가", "불충족"),
    evidenceRefs: strings(), explanation: text, scope: choice("screen", "region", "element", "unknown"),
  }) },
}, ["screenId", "verdict", "reasons", "relevance", "checks"]) };

/** 필요한 JSON Schema 부분집합만 검사한다. 자료형 강제 변환·항목 삭제·기본값 삽입 없음. */
export function validateGeminiSchema(value: unknown, schema: JsonSchema, stage: GeminiStage, path = "$"): void {
  const fail = (reason: string, field = path): never => {
    throw new GeminiSearchError("schema", stage, `Gemini가 예상과 다른 검색 결과를 돌려줬어요. JSON 구조 검증 오류: ${field} (${reason})`, field);
  };
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail("객체가 필요합니다");
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!Object.hasOwn(record, key)) fail("필수 필드가 없습니다", `${path}.${key}`);
    // 응답에 임의로 추가된 필드명 자체도 진단에 노출하지 않는다.
    if (Object.keys(record).some(key => !Object.hasOwn(schema.properties ?? {}, key))) fail("허용되지 않은 추가 필드가 있습니다");
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (Object.hasOwn(record, key)) validateGeminiSchema(record[key], child, stage, `${path}.${key}`);
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) fail("배열이 필요합니다");
    const array = value as unknown[];
    if (array.length < (schema.minItems ?? 0) || array.length > (schema.maxItems ?? Infinity)) fail("배열 항목 수가 허용 범위를 벗어났습니다");
    array.forEach((item, i) => validateGeminiSchema(item, schema.items!, stage, `${path}[${i}]`));
  } else {
    if (typeof value !== "string") fail("문자열이 필요합니다");
    if (schema.minLength && !(value as string).trim()) fail("빈 문자열은 허용되지 않습니다");
    if (schema.enum && !schema.enum.includes(value as string)) fail("허용된 값이 아닙니다");
  }
}
