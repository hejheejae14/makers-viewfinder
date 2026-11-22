import { readFile } from "node:fs/promises";
import { authorize, json } from "../../1-1-index-sync/auth";
import type { TeamIndex } from "../../../lib/types";

export const MCP_POC_FILE = "/private/tmp/viewfinder-mcp-app-poc/index.json";
const FILE_KEY = "Hbwppk3hFZm1jq7GuclyXG";

/** 로컬 검증 전용. 저장소·동기화·Figma API를 사용하지 않는다. */
export async function handleMcpPocIndex(request: Request, readIndex = () => readFile(MCP_POC_FILE, "utf8")): Promise<Response> {
  if (process.env.NODE_ENV !== "development") return json({ error: "Not found" }, 404);
  const denied = authorize(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (body?.team !== "앱") return json({ error: "이 임시 인덱스는 앱 팀만 포함합니다." }, 400);
  try {
    const index = JSON.parse(await readIndex()) as TeamIndex;
    if (index.team !== "앱" || typeof index.syncedAt !== "string" || !Array.isArray(index.screens)
      || index.screens.length !== 4 || !index.screens.every(s => s.teamPage === "앱" && s.fileKey === FILE_KEY
        && typeof s.id === "string" && typeof s.name === "string" && Array.isArray(s.texts)
        && s.texts.every(t => typeof t === "string") && Array.isArray(s.components) && Array.isArray(s.tokens)
        && s.figmaUrl === `https://www.figma.com/design/${FILE_KEY}/?node-id=${s.id.replace(":", "-")}`)) {
      return json({ error: "APP PoC 인덱스의 형식 또는 대상 파일이 일치하지 않습니다." }, 422);
    }
    return json(index);
  } catch {
    return json({ error: "APP PoC 임시 인덱스를 읽지 못했습니다. 로컬 임시 파일을 확인해 주세요." }, 404);
  }
}
