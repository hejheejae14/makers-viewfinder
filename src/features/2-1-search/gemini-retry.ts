export interface RetryEvents {
  signal?: AbortSignal;
  onRequest?: () => void;
  onRetry?: (delayMs: number) => void;
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException("취소", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** 503 응답만 최대 한 번 재시도한다. 키·요청·응답 원문은 이벤트에 전달하지 않는다. */
export async function requestWith503Retry(send: () => Promise<Response>, events: RetryEvents = {},
  sleep: (delayMs: number, signal?: AbortSignal) => Promise<void> = wait): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    events.signal?.throwIfAborted();
    events.onRequest?.();
    const response = await send();
    if (response.status !== 503 || attempt >= 1) return response;
    const retryAfter = response.headers?.get("retry-after");
    const serverDelay = retryAfter ? (/^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : NaN;
    // 서버가 긴 대기를 요구하면 짧게 무시하고 재요청하지 않는다.
    if (Number.isFinite(serverDelay) && serverDelay > 10000) return response;
    const delayMs = Math.max(1000 + Math.floor(Math.random() * 500), Number.isFinite(serverDelay) ? serverDelay : 0);
    await response.body?.cancel().catch(() => undefined);
    events.signal?.throwIfAborted();
    events.onRetry?.(delayMs);
    await sleep(delayMs, events.signal);
  }
}
