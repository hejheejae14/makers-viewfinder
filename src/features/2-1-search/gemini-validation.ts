import type { SearchCondition } from "./candidate-search";
import type { AiJudgement } from "./search";

const MAX_CONDITIONS = 20;
const MAX_ALIASES = 12;
const MAX_JUDGEMENTS = 20;

export function parseGeminiJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini가 검색 결과를 올바른 JSON 형식으로 돌려주지 않았습니다. 다시 시도해 주세요.");
  }
}

export function parseInterpretation(value: unknown): { conditions: SearchCondition[] } {
  if (!isRecord(value) || !Array.isArray(value.conditions)) throw invalidResponse();

  const conditions = value.conditions.slice(0, MAX_CONDITIONS).flatMap((item) => {
    if (!isRecord(item) || typeof item.label !== "string" || !Array.isArray(item.aliases)) return [];
    const label = item.label.trim();
    const aliases = item.aliases
      .filter((alias): alias is string => typeof alias === "string")
      .map((alias) => alias.trim())
      .filter(Boolean)
      .slice(0, MAX_ALIASES);
    return label && aliases.length > 0 ? [{ label, aliases }] : [];
  });

  if (conditions.length === 0) throw new Error("Gemini가 검색 조건을 찾지 못했습니다. 검색어를 조금 더 구체적으로 입력해 주세요.");
  return { conditions };
}

export function parseJudgements(value: unknown): AiJudgement[] {
  if (!Array.isArray(value)) throw invalidResponse();

  return value.slice(0, MAX_JUDGEMENTS).flatMap((item) => {
    if (!isRecord(item) || typeof item.screenId !== "string" || !isVerdict(item.verdict) || !Array.isArray(item.reasons)) {
      return [];
    }

    const reasons = strings(item.reasons);
    const unmetConditions = Array.isArray(item.unmetConditions) ? strings(item.unmetConditions) : undefined;
    if (reasons.length === 0) return [];

    return [{ screenId: item.screenId, verdict: item.verdict, reasons, unmetConditions }];
  });
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
  return new Error("Gemini가 예상과 다른 검색 결과를 돌려줬습니다. 다시 시도해 주세요.");
}
