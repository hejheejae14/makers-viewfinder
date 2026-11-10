import { authorize, json } from "./auth";
import { FigmaAccessError, figmaGet } from "./figma-library";
import { PD_FILE_KEY } from "./config";
import { getStore } from "./store";

/**
 * 팀 공용 Figma 토큰입니다. 인덱스 동기화와 화면 이미지가 모두 이 토큰 하나로 Figma를 읽습니다. (읽기 전용 토큰)
 * - /sync 화면에서 등록하면 검색 인덱스를 저장하는 곳(Redis)에 보관합니다.
 * - 토큰 값은 어떤 응답에도 다시 돌려주지 않고, 로그에도 남기지 않습니다. 등록 여부와 등록한 날짜만 알려 줍니다.
 * - 등록·삭제는 팀 비밀번호를 서버에서 확인한 뒤에만 합니다.
 */

const KEY = "shared-figma-token";

interface Saved {
  token: string;
  savedAt: string; // ISO 문자열
}

/** 등록된 토큰이 없을 때 */
export class FigmaTokenMissingError extends Error {
  constructor() {
    super("팀 공용 Figma 토큰이 등록되어 있지 않습니다. /sync 화면에서 등록하세요.");
  }
}

/** 서버 안에서만 쓰는 읽기. 등록된 토큰이 없으면 FigmaTokenMissingError */
export async function getSharedFigmaToken(): Promise<string> {
  const saved = await getStore().get<Saved>(KEY);
  if (!saved?.token) throw new FigmaTokenMissingError();
  return saved.token;
}

const ACTIONS = ["status", "set", "clear"] as const;

/** POST { action: "status" | "set" | "clear", token? } → { configured, savedAt? } */
export async function handleFigmaTokenRequest(request: Request): Promise<Response> {
  const denied = authorize(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { action?: string; token?: unknown } | null;
  const action = ACTIONS.find((candidate) => candidate === body?.action);
  if (!action) return json({ error: "action(status, set, clear)이 필요합니다." }, 400);

  try {
    const store = getStore();
    if (action === "set") {
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      if (!token) return json({ error: "등록할 Figma 토큰이 필요합니다." }, 400);
      // 저장하기 전에 [PD] 문서 모음을 읽을 수 있는 토큰인지 확인한다. (읽기 요청만 보냄)
      await figmaGet(`/v1/files/${PD_FILE_KEY}?depth=1`, token);
      await store.set(KEY, { token, savedAt: new Date().toISOString() } satisfies Saved);
    }
    if (action === "clear") await store.del(KEY);

    const saved = await store.get<Saved>(KEY);
    return json({ configured: Boolean(saved), savedAt: saved?.savedAt ?? null });
  } catch (error) {
    if (error instanceof FigmaAccessError) return json({ error: error.message }, 403);
    return json({ error: error instanceof Error ? error.message : "알 수 없는 오류가 났습니다." }, 500);
  }
}
