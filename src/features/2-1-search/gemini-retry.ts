/** 일시적인 서버 오류만 재시도합니다. 키·한도 오류는 반복하지 않습니다. */
export async function requestWithRetry(
  request: () => Promise<Response>,
  options: {
    signal?: AbortSignal;
    onRequest?: () => void;
    onRetry?: (attempt: number) => void;
    wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  } = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    options.onRequest?.();
    const response = await request();
    if (![500, 502, 503, 504].includes(response.status) || attempt >= 2) return response;
    await response.body?.cancel();
    options.onRetry?.(attempt + 1);
    await (options.wait ?? waitForRetry)(1000 * 2 ** attempt, options.signal);
  }
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
