import "client-only";

import { buildInterpretInput, SEARCH_INTERPRET_INSTRUCTIONS, SEARCH_JUDGE_INSTRUCTIONS } from "./judge-prompt";
import { prepareJudgeInput, type JudgePayloadStats } from "./judge-payload";
import { parseInterpretation, parseJudgements } from "./gemini-validation";
import { requestGeminiJson } from "./gemini-request";
import { attachGeminiContext } from "./gemini-error";
import type { SearchAi } from "./search";
import { DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL } from "./gemini-config";
import type { GeminiStage } from "./gemini-error";

export { DEFAULT_GEMINI_MODEL } from "./gemini-config";
interface GeminiOptions {
  model?: string;
  onRequest?: (stage: GeminiStage) => void;
  onRetry?: (stage: GeminiStage, delayMs: number, model: string) => void;
  onPayload?: (stats: JudgePayloadStats) => void;
}

/** 개인 키는 브라우저의 Gemini 요청에만 사용한다. 공용·환경변수 키 대체 없음. */
export function createGeminiSearchAi(apiKey: string, options: GeminiOptions = {}): SearchAi {
  const key = apiKey.trim();
  if (!key) throw new Error("Gemini API 키를 입력해 주세요.");
  let model = options.model?.trim() || DEFAULT_GEMINI_MODEL;
  // 한 검색 안에서는 성공한 대체 모델을 다음 단계에서도 사용한다.
  const retryModel = () => model === DEFAULT_GEMINI_MODEL ? FALLBACK_GEMINI_MODEL : model;
  return {
    async interpret({ query, team, signal }) {
      const fallbackModel = retryModel();
      const response = await requestGeminiJson({ apiKey: key, model, fallbackModel, stage: "interpret", systemInstruction: SEARCH_INTERPRET_INSTRUCTIONS, input: buildInterpretInput(query, team), signal,
        onRequest: () => options.onRequest?.("interpret"), onRetry: delay => options.onRetry?.("interpret", delay, fallbackModel) });
      model = response.model;
      try { return parseInterpretation(response.value, query, team); }
      catch (error) { throw attachGeminiContext(error, "interpret", response.httpStatus, response.finishReason); }
    },
    async judge({ query, team, candidates, conditions, signal }) {
      const payload = prepareJudgeInput(query, candidates, conditions, team);
      options.onPayload?.(payload.stats);
      const fallbackModel = retryModel();
      const response = await requestGeminiJson({ apiKey: key, model, fallbackModel, stage: "judge", systemInstruction: SEARCH_JUDGE_INSTRUCTIONS, input: payload.input, signal,
        onRequest: () => options.onRequest?.("judge"), onRetry: delay => options.onRetry?.("judge", delay, fallbackModel) });
      model = response.model;
      try {
        return parseJudgements(response.value, true).map(j => ({ ...j, ...payload.coverage.find(c => c.screenId === j.screenId) }));
      }
      catch (error) { throw attachGeminiContext(error, "judge", response.httpStatus, response.finishReason); }
    },
  };
}
