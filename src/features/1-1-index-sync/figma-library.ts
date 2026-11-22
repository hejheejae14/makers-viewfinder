import { MDS_LIBRARIES, type MdsComponentKeys, type MdsKeys, type MdsStyleKeys } from "./mds";

/**
 * Figma에서 읽어 옵니다. (읽기 전용: GET 요청만 보냅니다.)
 *
 * Figma 토큰은 /sync에서 등록한 팀 공용 읽기 전용 토큰(figma-token.ts)입니다.
 * 로그나 오류 메시지에는 출력하지 않습니다.
 */

/** 팀 공용 Figma 토큰으로 필요한 파일을 읽을 수 없을 때 (토큰이 틀렸거나 만료됐거나 파일 접근 권한이 없음) */
export class FigmaAccessError extends Error {
  code: "authentication" | "forbidden" | "not-found-or-inaccessible";
  constructor(status = 403) {
    super(
      "팀 공용 Figma 토큰으로 필요한 파일을 읽을 수 없어요. 토큰이 맞는지, 만료되지 않았는지, [PD] 문서 모음과 MDS 파일을 볼 수 있는 계정인지 확인한 뒤 인덱스 동기화 화면에서 새 토큰을 등록해 주세요.",
    );
    this.code = status === 401 ? "authentication" : status === 404 ? "not-found-or-inaccessible" : "forbidden";
  }
}

const FIGMA_API = "https://api.figma.com";
export class FigmaRateLimitError extends Error {
  code = "rate-limit" as const;
  retryAfter: number;
  constructor(retryAfter: number) { super(`Figma 요청 제한. ${retryAfter}초 후 다시 시도해 주세요.`); this.retryAfter = retryAfter; }
}

export async function figmaGet<T>(path: string, token: string): Promise<T> {
    const res = await fetch(FIGMA_API + path, { headers: { "X-Figma-Token": token }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (res.status === 429) {
      throw new FigmaRateLimitError(Math.max(Number(res.headers.get("retry-after")) || 60, 1));
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) throw new FigmaAccessError(res.status);
    // MDS 목록을 못 가져오면 모든 컴포넌트가 "MDS 아님"으로 잘못 판정되므로, 조용히 넘어가지 않고 멈춘다.
    if (!res.ok) throw new Error(`Figma 요청 실패 (${res.status}): ${path}`);
    return (await res.json()) as T;
}

/** MDS v1, v2 파일에 공개된 컴포넌트와 스타일(토큰) 키를 모두 모아 돌려준다. 요청은 파일당 2번(컴포넌트, 스타일)이다. */
export async function loadMdsKeys(token: string): Promise<MdsKeys> {
  const components: MdsComponentKeys = new Map();
  const styles: MdsStyleKeys = new Set();
  for (const library of MDS_LIBRARIES) {
    const componentList = await figmaGet<{ meta: { components: { key: string }[] } }>(
      `/v1/files/${library.fileKey}/components`,
      token,
    );
    for (const component of componentList.meta.components) components.set(component.key, library.version);

    const styleList = await figmaGet<{ meta: { styles: { key: string }[] } }>(`/v1/files/${library.fileKey}/styles`, token);
    for (const style of styleList.meta.styles) styles.add(style.key);
  }
  return { components, styles };
}
