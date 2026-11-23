import { createHash, timingSafeEqual } from "node:crypto";
import { SEARCH_TEAMS } from "../../lib/screen-identity";
import { authorize, json } from "./auth";
import { getStore, type KvStore } from "./store";
import { createMcpImporter, McpImportError } from "./mcp-import";

const digest = (v: string) => createHash("sha256").update(v).digest();
export const MAX_IMPORT_BYTES = 2_000_000;

/** 공용 팀 인증에 관리자 인증을 추가한다. 설정이 없으면 공개 API로 동작하지 않는다. */
export async function handleMcpImport(request: Request, store: () => KvStore = getStore) {
  const denied = authorize(request);
  if (denied) return denied;
  const expected = process.env.MCP_IMPORT_ADMIN_PASSWORD;
  if (!expected || expected.length < 16 || expected === process.env.TEAM_PASSWORD) {
    return json({ error: "서버에 별도의 관리자 비밀번호(16자 이상)가 설정되지 않아 가져오기가 잠겨 있습니다." }, 503);
  }
  if (!timingSafeEqual(digest(request.headers.get("x-mcp-admin-password") ?? ""), digest(expected))) {
    return json({ error: "관리자 인증에 실패했습니다." }, 401);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "다른 사이트에서의 요청은 허용하지 않습니다." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON 요청만 허용합니다." }, 415);
  try {
    // Content-Length를 신뢰하지 않고 스트림을 읽는 동안 크기를 제한한다.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "JSON 본문이 필요합니다." }, 400);
    const decoder = new TextDecoder();
    let size = 0, body = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMPORT_BYTES) { await reader.cancel(); return json({ error: "JSON은 2MB 이하만 허용합니다." }, 413); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    let input;
    try { input = JSON.parse(body); } catch { return json({ error: "올바른 JSON 파일을 선택해 주세요." }, 400); }
    const team = SEARCH_TEAMS.find(t => t === input?.team);
    if (!team) return json({ error: "앱·플그·크루·공홈 중 팀을 선택해 주세요." }, 400);
    if (input.action !== "review" && input.action !== "publish") return json({ error: "review 또는 publish 작업이 필요합니다." }, 400);
    if (input.action === "publish" && (typeof input.id !== "string" || !/^[a-f0-9-]{36}$/.test(input.id) || input.confirmed !== true)) {
      return json({ error: "검토 식별자와 명시적인 반영 확인이 필요합니다." }, 400);
    }
    const importer = createMcpImporter(store());
    return json(input.action === "review" ? await importer.review(team, input.index) : await importer.publish(team, input.id));
  } catch (error) {
    if (error instanceof McpImportError) return json({ error: error.message }, error.status);
    // 저장소 오류·요청 원문·인증 정보를 클라이언트나 로그로 전달하지 않는다.
    return json({ error: "가져오기를 완료하지 못했습니다. 운영 반영 여부를 확인한 뒤 다시 검토해 주세요." }, 500);
  }
}
