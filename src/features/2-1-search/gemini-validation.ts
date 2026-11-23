import type { AiJudgement, ConditionCheck, ConditionKind, QueryUnderstanding, Requirement, SearchCondition } from "./search-model";
import { guardUnderstanding } from "./query-understanding";
import { INTERPRET_SCHEMA, JUDGE_SCHEMA, validateGeminiSchema } from "./gemini-schema";
import { GeminiSearchError } from "./gemini-error";

const MAX_CONDITIONS = 20;
const MAX_ALIASES = 12;
const MAX_JUDGEMENTS = 60;

export function parseGeminiJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini가 검색 결과를 올바른 JSON 형식으로 돌려주지 않았어요. 다시 시도해 주세요.");
  }
}

export function parseInterpretation(value: unknown, query?: string): QueryUnderstanding {
  if (query !== undefined) validateGeminiSchema(value, INTERPRET_SCHEMA, "interpret");
  if (!isRecord(value) || !Array.isArray(value.conditions)) throw invalidResponse();
  if (value.conditions.length > MAX_CONDITIONS) throw new Error("검색 조건이 너무 많아요. 검색어를 나눠 입력해 주세요.");
  const warnings: string[] = [];

  const conditions = value.conditions.slice(0, MAX_CONDITIONS).flatMap((item, i) => {
    if (!isRecord(item) || typeof item.label !== "string" || !Array.isArray(item.aliases)) {
      if (query !== undefined) throw invalidResponse();
      return [];
    }
    const label = item.label.trim();
    const aliases = item.aliases
      .filter((alias): alias is string => typeof alias === "string")
      .map((alias) => alias.trim())
      .filter(Boolean)
      .slice(0, MAX_ALIASES);
    if (query === undefined) return label && aliases.length > 0 ? [{ label, aliases }] : [];
    const kinds: ConditionKind[] = ["service", "screen", "function", "state", "component", "property", "platform", "text", "token", "cohort"];
    const requirements: Requirement[] = ["must", "should", "exclude"];
    if (!label || !aliases.length || typeof item.id !== "string" || !item.id.trim()
      || !kinds.includes(item.kind as ConditionKind) || !requirements.includes(item.requirement as Requirement)
      || typeof item.sourceText !== "string" || !item.sourceText.trim()) {
      throw new GeminiSearchError("semantic", "interpret", "검색 조건을 원문과 연결하지 못했어요. 사용자가 말하지 않은 조건을 적용하지 않도록 검색을 중단했어요.", `$.conditions[${i}].sourceText`);
    }
    const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
    const sourceVerified = normalized(query).includes(normalized(item.sourceText as string));
    if (!sourceVerified) warnings.push("일부 검색 조건의 원문 인용을 확인하지 못했어요. 해당 조건은 추정으로 표시하고 가까운 화면을 추천합니다.");
    if (item.requirement === "should" && !/가능하면|선호|있으면|선택|되도록|가급적|prefer|optional/i.test(query)) {
      warnings.push("명시적인 선호 표현이 없어 AI가 참고조건으로 해석한 항목을 필수조건으로 유지했어요.");
    }
    const requirement = item.requirement === "should" && !/가능하면|선호|있으면|선택|되도록|가급적|prefer|optional/i.test(query) ? "must" : item.requirement as Requirement;
    return [{ label, aliases, id: item.id, kind: item.kind as ConditionKind, requirement,
      sourceText: item.sourceText, scope: item.scope === "screen" || item.scope === "region" || item.scope === "element" ? item.scope : undefined,
      relatedTo: typeof item.relatedTo === "string" && item.relatedTo ? item.relatedTo : undefined,
      ...(!sourceVerified ? { sourceVerified: false } : {}) } satisfies SearchCondition];
  });

  if (conditions.length === 0) throw new Error("Gemini가 검색 조건을 찾지 못했어요. 검색어를 조금 더 구체적으로 입력해 주세요.");
  if (query === undefined) return { conditions };
  try { return guardUnderstanding(query, { conditions, warnings: [...new Set(warnings)] }); }
  catch { throw new GeminiSearchError("semantic", "interpret", "검색 조건 ID·연결 관계·기수 등 원문의 의미를 검증하지 못했어요.", "$.conditions"); }
}

export function parseJudgements(value: unknown, strict = false): AiJudgement[] {
  // 알려진 부정 응답은 추천 요청으로 해석하되 검증기에서 정답 승격을 금지한다.
  const negativeIds = new Set<string>();
  if (strict && Array.isArray(value)) value = value.map(item => {
    if (isRecord(item) && item.verdict === "불충족 후보") {
      if (typeof item.screenId === "string") negativeIds.add(item.screenId);
      return { ...item, verdict: "부분 일치" };
    }
    return item;
  });
  if (strict) validateGeminiSchema(value, JUDGE_SCHEMA, "judge");
  if (!Array.isArray(value)) throw invalidResponse();

  const parsed: AiJudgement[] = value.slice(0, MAX_JUDGEMENTS).flatMap((item) => {
    if (!isRecord(item) || typeof item.screenId !== "string" || !isVerdict(item.verdict) || !Array.isArray(item.reasons)) {
      return [];
    }

    const reasons = strings(item.reasons);
    const unmetConditions = Array.isArray(item.unmetConditions) ? strings(item.unmetConditions) : undefined;
    if (reasons.length === 0) return [];

    if (!strict) return [{ screenId: item.screenId, verdict: item.verdict, reasons, unmetConditions }];
    if (!["high", "medium", "low", "irrelevant"].includes(String(item.relevance)) || !Array.isArray(item.checks)) throw invalidResponse();
    const checks: ConditionCheck[] = item.checks.map((check) => {
      if (!isRecord(check) || typeof check.conditionId !== "string" || !["확인됨", "추정", "확인 불가", "불충족"].includes(String(check.status))
        || !Array.isArray(check.evidenceRefs) || !check.evidenceRefs.every((ref) => typeof ref === "string") || typeof check.explanation !== "string") throw invalidResponse();
      return { conditionId: check.conditionId, status: check.status as ConditionCheck["status"], evidenceRefs: check.evidenceRefs as string[], explanation: check.explanation,
        scope: ["screen", "region", "element", "unknown"].includes(String(check.scope)) ? check.scope as ConditionCheck["scope"] : "unknown" };
    });
    return [{ screenId: item.screenId, verdict: item.verdict, reasons, unmetConditions, relevance: item.relevance as AiJudgement["relevance"], checks,
      ...(negativeIds.has(item.screenId) ? { recommendationOnly: true } : {}) }];
  });
  if (strict && parsed.length !== Math.min(value.length, MAX_JUDGEMENTS)) throw invalidResponse();
  return parsed;
}

function strings(values: unknown[]) {
  return values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean);
}

function isVerdict(value: unknown): value is AiJudgement["verdict"] {
  return value === "정답 후보" || value === "부분 일치";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function invalidResponse() {
  return new Error("Gemini가 예상과 다른 검색 결과를 돌려줬어요. 다시 시도해 주세요.");
}
