import "client-only";

import {
  buildInterpretInput,
  buildJudgeInput,
  SEARCH_INTERPRET_INSTRUCTIONS,
  SEARCH_JUDGE_INSTRUCTIONS,
} from "./judge-prompt";
import { parseGeminiJson, parseInterpretation, parseJudgements } from "./gemini-validation";
import type { SearchAi } from "./search";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

interface GeminiOptions {
  model?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
}

/** 개인 Gemini 키는 저장하지 않고 이 브라우저의 Gemini 요청 헤더에만 넣습니다. */
export function createGeminiSearchAi(apiKey: string, options: GeminiOptions = {}): SearchAi {
  const key = apiKey.trim();
  if (!key) throw new Error("Gemini API 키를 입력해 주세요.");
  const model = options.model?.trim() || DEFAULT_GEMINI_MODEL;

  return {
    async interpret({ query, team, signal }) {
      const value = await generateJson({
        apiKey: key,
        model,
        systemInstruction: SEARCH_INTERPRET_INSTRUCTIONS,
        input: buildInterpretInput(query, team),
        signal,
      });
      return parseInterpretation(value);
    },

    async judge({ query, candidates, signal }) {
      const value = await generateJson({
        apiKey: key,
        model,
        systemInstruction: SEARCH_JUDGE_INSTRUCTIONS,
        input: buildJudgeInput(query, candidates),
        signal,
      });
      return parseJudgements(value);
    },
  };
}

interface GenerateJsonOptions {
  apiKey: string;
  model: string;
  systemInstruction: string;
  input: string;
  signal?: AbortSignal;
}

async function generateJson({ apiKey, model, systemInstruction, input, signal }: GenerateJsonOptions) {
  let response: Response;
  try {
    response = await fetch(`${GEMINI_API}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: input }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
        store: false,
      }),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Gemini에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }

  if (!response.ok) throw geminiHttpError(response.status);

  const body = (await response.json().catch(() => null)) as GeminiResponse | null;
  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) {
    if (body?.promptFeedback?.blockReason) throw new Error("Gemini가 이 검색어의 처리를 차단했습니다. 다른 표현으로 다시 시도해 주세요.");
    throw new Error("Gemini가 검색 결과를 돌려주지 않았습니다. 다시 시도해 주세요.");
  }

  return parseGeminiJson(text);
}

function geminiHttpError(status: number) {
  if (status === 400) return new Error("Gemini 요청을 처리하지 못했습니다. API 키와 검색어를 확인해 주세요.");
  if (status === 401 || status === 403) return new Error("Gemini API 키가 올바르지 않거나 사용할 권한이 없습니다.");
  if (status === 429) return new Error("Gemini 무료 사용 한도를 모두 썼습니다. 잠시 후 다시 시도하거나 다른 키를 입력해 주세요.");
  if (status >= 500) return new Error("Gemini 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.");
  return new Error(`Gemini 요청에 실패했습니다. (${status})`);
}
