/**
 * 컴포넌트가 어느 라이브러리 파일에서 왔는지 Figma에서 조회합니다. (읽기 전용: GET 요청만 보냅니다.)
 * Figma 토큰은 환경 변수 FIGMA_TOKEN에서만 읽고, 로그나 오류 메시지에 출력하지 않습니다.
 */

const FIGMA_API = "https://api.figma.com";

const MAX_RETRIES = 5;
const REQUEST_GAP_MS = 250; // 요청 사이 간격. 짧은 시간에 몰아 보내면 한도에 걸린다.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function figmaGet<T>(path: string): Promise<T | undefined> {
  const token = process.env.FIGMA_TOKEN;
  if (!token) throw new Error("FIGMA_TOKEN이 설정되지 않았습니다.");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(FIGMA_API + path, { headers: { "X-Figma-Token": token }, cache: "no-store" });
    if (res.status === 429) {
      // 요청 한도: Figma가 알려 준 시간만큼 기다렸다가 다시 시도한다.
      // 안내된 시간이 짧아도 한도가 바로 풀리지 않는 경우가 있어, 기다리는 시간을 점점 늘린다.
      const waitSeconds = Math.max(Number(res.headers.get("retry-after")) || 0, 2) * 2 ** attempt;
      if (attempt >= MAX_RETRIES) throw new Error("Figma 요청 한도가 풀리지 않습니다. 잠시 뒤 다시 시도하세요.");
      await sleep(Math.min(waitSeconds, 30) * 1000);
      continue;
    }
    await sleep(REQUEST_GAP_MS);
    // 404(찾을 수 없음)와 403(접근 권한 없음)은 "알 수 없음"으로 보고 넘어간다.
    if (!res.ok) return undefined;
    return (await res.json()) as T;
  }
}

/**
 * 컴포넌트 키 목록 → 소속 라이브러리 파일 이름.
 * 조회에 실패한 키는 결과에 넣지 않는다. (MDS가 아닌 것과 모르는 것을 구분하기 위해)
 */
export async function resolveLibraryNames(
  componentKeys: string[],
  concurrency = 1,
): Promise<Record<string, string>> {
  const fileKeyOf: Record<string, string> = {};
  const queue = [...new Set(componentKeys)];

  const worker = async () => {
    for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
      const found = await figmaGet<{ meta: { file_key: string } }>(`/v1/components/${key}`);
      if (found) fileKeyOf[key] = found.meta.file_key;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  const nameOfFile: Record<string, string> = {};
  for (const fileKey of new Set(Object.values(fileKeyOf))) {
    const meta = await figmaGet<{ file: { name: string } }>(`/v1/files/${fileKey}/meta`);
    if (meta?.file?.name) nameOfFile[fileKey] = meta.file.name;
  }

  const result: Record<string, string> = {};
  for (const [key, fileKey] of Object.entries(fileKeyOf)) {
    if (nameOfFile[fileKey]) result[key] = nameOfFile[fileKey];
  }
  return result;
}
