import { GeminiSearchError, type GeminiStage } from "./gemini-error";

export const GEMINI_STAGE_TIMEOUT_MS = { interpret: 20_000, judge: 40_000 } as const;

/** 재시도 대기와 응답 본문 수신을 포함한 단계 전체의 한도다. 취소·시간 초과는 재시도하지 않는다. */
export async function withGeminiDeadline<T>(stage: GeminiStage, external: AbortSignal | undefined,
  work: (signal: AbortSignal) => Promise<T>, timeoutMs: number = GEMINI_STAGE_TIMEOUT_MS[stage]): Promise<T> {
  external?.throwIfAborted();
  const controller = new AbortController();
  let rejectDeadline: (reason: unknown) => void = () => {};
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const abort = () => {
    controller.abort(external?.reason);
    rejectDeadline(external?.reason ?? new DOMException("검색 취소", "AbortError"));
  };
  external?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    const error = new GeminiSearchError("timeout", stage,
      `Gemini ${stage === "interpret" ? "검색 조건 해석" : "화면 판정"}의 대기시간을 초과했어요. 자동 재요청은 하지 않았습니다. 잠시 후 다시 시도해 주세요.`);
    controller.abort(error);
    rejectDeadline(error);
  }, timeoutMs);
  try { return await Promise.race([deadline, work(controller.signal)]); }
  finally { clearTimeout(timer); external?.removeEventListener("abort", abort); }
}
