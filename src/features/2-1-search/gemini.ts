import "client-only";

import {
  buildInterpretInput,
  buildJudgeInput,
  SEARCH_INTERPRET_INSTRUCTIONS,
  SEARCH_JUDGE_INSTRUCTIONS,
} from "./judge-prompt";
import { parseGeminiJson, parseInterpretation, parseJudgements } from "./gemini-validation";
import type { SearchAi } from "./search";
import { requestWithRetry } from "./gemini-retry";
import { describeGeminiError } from "./gemini-error";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

interface GeminiOptions {
  model?: string;
  onRequest?: () => void;
  onRetry?: (attempt: number) => void;
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
        onRequest: options.onRequest,
        onRetry: options.onRetry,
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
        onRequest: options.onRequest,
        onRetry: options.onRetry,
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
  onRequest?: () => void;
  onRetry?: (attempt: number) => void;
}

async function generateJson({ apiKey, model, systemInstruction, input, signal, onRequest, onRetry }: GenerateJsonOptions) {
  let response: Response;
  try {
    response = await requestWithRetry(() => fetch(`${GEMINI_API}/${encodeURIComponent(model)}:generateContent`, {
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
    }), { signal, onRequest, onRetry });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Gemini에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }

  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null);
    const detail = describeGeminiError(errorBody, apiKey);
    const base = geminiHttpError(response.status, model);
    throw new Error(detail ? `${base.message}\n${detail}` : base.message);
  }

  const body = (await response.json().catch(() => null)) as GeminiResponse | null;
  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) {
    if (body?.promptFeedback?.blockReason) throw new Error("Gemini가 이 검색어의 처리를 차단했습니다. 다른 표현으로 다시 시도해 주세요.");
    throw new Error("Gemini가 검색 결과를 돌려주지 않았습니다. 다시 시도해 주세요.");
  }

  return parseGeminiJson(text);
}

function geminiHttpError(status: number, model: string) {
  if (status === 400) return new Error(`Google이 Gemini 요청을 거절했습니다. (HTTP 400 · ${model})`);
  if (status === 401 || status === 403) return new Error("Gemini API 키가 올바르지 않거나 사용할 권한이 없습니다.");
  if (status === 404) return new Error(`모델 ${model}을 사용할 수 없습니다. Gemini 모델 설정에서 계정이 지원하는 모델을 선택해 주세요. (404)`);
  if (status === 429) return new Error("Gemini 요청 한도 또는 사용량 한도에 도달했습니다. AI Studio에서 한도를 확인해 주세요. (429)");
  if (status >= 500) return new Error(`Gemini ${model} 요청이 실패했습니다. (HTTP ${status}) 일시 오류는 최대 2회 재시도했습니다. Gemini 모델 설정에서 다른 사용 가능한 모델로 변경하거나 잠시 후 다시 시도해 주세요.`);
  return new Error(`Gemini 요청에 실패했습니다. (${status})`);
}
