import { createHash, randomUUID } from "node:crypto";
import type { IndexedScreen, SearchTeam, TeamIndex } from "../../lib/types";
import { screenIdentity } from "../../lib/screen-identity";
import type { KvStore } from "./store";
import { backupIndex, withIndexLock } from "./index-write";
import { validateMcpImport, type ImportIssue } from "./mcp-import-validation";

export class McpImportError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
export interface ImportReview {
  id: string;
  expiresAt: string;
  team: SearchTeam;
  existing: number;
  additions: number;
  duplicates: number;
  conflicts: ImportIssue[];
  rejected: ImportIssue[];
  targetInUpload: boolean;
  targetInMerged: boolean;
  deleted: number;
  changed: number;
  canPublish: boolean;
}
interface Draft { review: ImportReview; baseHash: string; additions: IndexedScreen[] }
const indexKey = (team: SearchTeam) => `viewfinder:index:${team}`;
const draftKey = (team: SearchTeam) => `viewfinder:mcp-import:draft:${team}`;
const TARGET = "Hbwppk3hFZm1jq7GuclyXG/14330:42211";

/** 객체 필드 순서는 무시하되 화면·텍스트·컴포넌트 배열 순서는 보존한다. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const content = ({ syncedAt: _syncedAt, ...data }: IndexedScreen) => { void _syncedAt; return hash(data); };

/** 외부 API 없이 주입된 저장소만 사용한다. 운영에는 서버 핸들러가 저장소를 주입한다. */
export function createMcpImporter(store: KvStore, now = Date.now) {
  const locked = <T>(team: SearchTeam, work: () => Promise<T>) => withIndexLock(store, team, work,
    () => new McpImportError("이 팀의 인덱스가 작업 중입니다. 잠시 후 다시 시도해 주세요."));
  async function readBase(team: SearchTeam) {
    // 준비된 REST 초안도 막는다. 나중에 오래된 REST 초안이 MCP 추가 화면을 지우는 일을 방지한다.
    if (await store.get(`viewfinder:multi-job:${team}`) || await store.get(`viewfinder:multi-draft:${team}`)) {
      throw new McpImportError("REST 동기화 작업 또는 검토 중인 초안이 있습니다. 먼저 해당 작업을 정리해 주세요.");
    }
    const base = await store.get<TeamIndex>(indexKey(team));
    if (base && (base.team !== team || !Array.isArray(base.screens) || !Array.isArray(base.excluded))) {
      throw new McpImportError("기존 인덱스 형식이 예상과 다릅니다. 기존 데이터를 수정하지 않고 중단했습니다.");
    }
    if (base && new Set(base.screens.map(screenIdentity)).size !== base.screens.length) {
      throw new McpImportError("기존 인덱스에 중복 식별자가 있습니다. 별도 검토가 필요합니다.");
    }
    return base;
  }
  async function review(team: SearchTeam, value: unknown): Promise<ImportReview> {
    let parsed: ReturnType<typeof validateMcpImport>;
    try { parsed = validateMcpImport(value, team); }
    catch { throw new McpImportError("TeamIndex JSON의 팀·필수 필드·화면 수(1~500개)를 확인해 주세요.", 422); }
    return locked(team, async () => {
      const base = await readBase(team);
      const byId = new Map((base?.screens ?? []).map(s => [screenIdentity(s), s]));
      const additions: IndexedScreen[] = [], conflicts: ImportIssue[] = [];
      let duplicates = 0;
      parsed.screens.forEach((s, row) => {
        const id = screenIdentity(s), previous = byId.get(id);
        if (!previous) { additions.push(s); byId.set(id, s); }
        else if (content(previous) === content(s)) duplicates++;
        else conflicts.push({ row: parsed.acceptedRows[row], reason: "동일한 fileKey + nodeId의 내용이 다릅니다. 자동 덮어쓰기는 허용하지 않습니다." });
      });
      const result: ImportReview = { id: randomUUID(), expiresAt: new Date(now() + 15 * 60_000).toISOString(), team,
        existing: base?.screens.length ?? 0, additions: additions.length, duplicates, conflicts, rejected: parsed.rejected,
        targetInUpload: parsed.screens.some(s => screenIdentity(s) === TARGET), targetInMerged: byId.has(TARGET),
        deleted: 0, changed: 0, canPublish: additions.length > 0 && !conflicts.length && !parsed.rejected.length };
      await store.set(draftKey(team), { review: result, baseHash: hash(base), additions } satisfies Draft);
      return result;
    });
  }
  async function publish(team: SearchTeam, id: string) {
    return locked(team, async () => {
      const draft = await store.get<Draft>(draftKey(team));
      if (!draft || draft.review.id !== id || Date.parse(draft.review.expiresAt) <= now()) {
        throw new McpImportError("검토가 만료되었거나 다른 검토로 바뀌었습니다. JSON을 다시 검토해 주세요.");
      }
      if (!draft.review.canPublish) throw new McpImportError("충돌·거부 항목이 있거나 추가할 화면이 없어 반영할 수 없습니다.");
      const base = await readBase(team);
      if (hash(base) !== draft.baseHash) throw new McpImportError("검토 후 운영 데이터가 변경됐습니다. 최신 데이터로 다시 검토해 주세요.");
      // 신뢰 경계를 다시 검사하고 기존 화면과 충돌하면 중단한다. 파일 단위 교체는 사용하지 않는다.
      const checked = validateMcpImport({ team, syncedAt: draft.review.expiresAt, screens: draft.additions, excluded: [] }, team);
      const existingIds = new Set((base?.screens ?? []).map(screenIdentity));
      if (checked.rejected.length || draft.additions.some(s => existingIds.has(screenIdentity(s)))
        || new Set(draft.additions.map(screenIdentity)).size !== draft.additions.length) throw new McpImportError("가져오기 초안을 다시 검증하지 못했습니다.");
      const merged: TeamIndex = { ...(base ?? { team, excluded: [] }), syncedAt: new Date(now()).toISOString(),
        screens: [...(base?.screens ?? []), ...draft.additions] };
      const backup = await backupIndex(store, team, `mcp-${id}`, base);
      await store.set(indexKey(team), merged);
      await store.set(`viewfinder:mcp-import:last:${team}`, { id, scope: "partial", collectedBy: "mcp",
        componentsAndTokensCoverage: "unverified", imported: draft.additions.length, publishedAt: merged.syncedAt, backup });
      await store.del(draftKey(team));
      return { published: true, added: draft.additions.length, total: merged.screens.length, backup };
    });
  }
  return { review, publish };
}
