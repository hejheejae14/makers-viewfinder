import { MDS_LIBRARIES, type MdsComponentKeys } from "./mds";

/**
 * MDS 라이브러리 파일의 컴포넌트 목록을 Figma에서 가져옵니다. (읽기 전용: GET 요청만 보냅니다.)
 * Figma 토큰은 환경 변수 FIGMA_TOKEN에서만 읽고, 로그나 오류 메시지에 출력하지 않습니다.
 */

const FIGMA_API = "https://api.figma.com";
const MAX_RETRIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function figmaGet<T>(path: string): Promise<T> {
  const token = process.env.FIGMA_TOKEN;
  if (!token) throw new Error("FIGMA_TOKEN이 설정되지 않았습니다.");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(FIGMA_API + path, { headers: { "X-Figma-Token": token }, cache: "no-store" });
    if (res.status === 429) {
      // 안내된 시간이 짧아도 한도가 바로 풀리지 않는 경우가 있어, 기다리는 시간을 점점 늘린다.
      const waitSeconds = Math.max(Number(res.headers.get("retry-after")) || 0, 2) * 2 ** attempt;
      if (attempt >= MAX_RETRIES) throw new Error("Figma 요청 한도가 풀리지 않습니다. 잠시 뒤 다시 시도하세요.");
      await sleep(Math.min(waitSeconds, 30) * 1000);
      continue;
    }
    // MDS 목록을 못 가져오면 모든 컴포넌트가 "MDS 아님"으로 잘못 판정되므로, 조용히 넘어가지 않고 멈춘다.
    if (!res.ok) throw new Error(`Figma 요청 실패 (${res.status}): ${path}`);
    return (await res.json()) as T;
  }
}

/** MDS v1, v2 파일에 공개된 컴포넌트 키를 모두 모아 돌려준다. 동기화 한 번에 요청 2번이면 된다. */
export async function loadMdsComponentKeys(): Promise<MdsComponentKeys> {
  const keys: MdsComponentKeys = new Map();
  for (const library of MDS_LIBRARIES) {
    const { meta } = await figmaGet<{ meta: { components: { key: string }[] } }>(
      `/v1/files/${library.fileKey}/components`,
    );
    for (const component of meta.components) keys.set(component.key, library.version);
  }
  return keys;
}
