import { randomUUID } from "node:crypto";
import type { SearchTeam, TeamIndex } from "../../lib/types";
import type { KvStore } from "./store";
import type { Job } from "./sync-engine";
import { getFileSources } from "./file-registry";
import { withIndexLock } from "./index-write";
import { McpImportError, snapshotHash } from "./mcp-import";

type Kind = "작업" | "REST 초안" | "기준 스냅샷" | "파일별 임시 결과";
interface Entry { key: string; kind: Kind; value: unknown }
interface Snapshot { indexHash: string; existingScreens: number; entries: Entry[] }
export interface RestCancelReview {
  id: string;
  team: SearchTeam;
  existingScreens: number;
  job?: { done: number; total: number; files: { name: string; status: string; screens: number }[] };
  draftScreens?: number;
  targets: { key: string; kind: Kind }[];
  expiresAt: string;
  canCancel: boolean;
  resuming: boolean;
}
interface ReviewState { review: RestCancelReview; fingerprint: string }
interface Backup extends ReviewState { snapshot: Snapshot }
interface Active { id: string; backup: string }
interface Receipt { id: string; cancelled: true; backup: string; completedAt: string; removed: number }
const jobKey = (team: SearchTeam) => `viewfinder:multi-job:${team}`;
const draftKey = (team: SearchTeam) => `viewfinder:multi-draft:${team}`;
const reviewKey = (team: SearchTeam) => `viewfinder:rest-cancel:review:${team}`;
const activeKey = (team: SearchTeam) => `viewfinder:rest-cancel:active:${team}`;
const receiptKey = (team: SearchTeam) => `viewfinder:rest-cancel:last:${team}`;
const backupKey = (team: SearchTeam, id: string) => `viewfinder:rest-cancel:backup:${team}:${id}`;

/** 정확한 작업 키만 사용한다. 키 검색·패턴 삭제·운영 인덱스 쓰기는 하지 않는다. */
export function createRestCanceller(store: KvStore, now = Date.now) {
  const locked = <T>(team: SearchTeam, work: () => Promise<T>) => withIndexLock(store, team, work,
    () => new McpImportError("이 팀이 작업 중입니다. 작업이 끝난 뒤 취소 상태를 다시 검토해 주세요."));
  async function operation(team: SearchTeam) {
    const index = await store.get<TeamIndex>(`viewfinder:index:${team}`);
    if (index && (index.team !== team || !Array.isArray(index.screens))) throw new McpImportError("운영 인덱스 형식을 확인할 수 없어 중단했습니다.");
    return { indexHash: snapshotHash(index), existingScreens: index?.screens.length ?? 0 };
  }
  async function capture(team: SearchTeam) {
    const [op, job, draft] = await Promise.all([operation(team), store.get<Job>(jobKey(team)), store.get<TeamIndex>(draftKey(team))]);
    if (draft && (draft.team !== team || !Array.isArray(draft.screens))) throw new McpImportError("REST 초안의 팀·형식을 확인할 수 없어 중단했습니다.");
    const entries: Entry[] = [{ key: jobKey(team), kind: "작업", value: job ?? null }, { key: draftKey(team), kind: "REST 초안", value: draft ?? null }];
    if (job) {
      const sources = getFileSources(team);
      if (typeof job.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(job.id) || !Array.isArray(job.files) || !Number.isSafeInteger(job.next)
        || job.next < 0 || job.next > job.files.length || new Set(job.files.map(f => f?.source?.sourceId)).size !== job.files.length
        || job.files.some(f => !f?.source || f.source.team !== team || !f.status || !sources.some(s => s.sourceId === f.source.sourceId && s.fileKey === f.source.fileKey))) {
        throw new McpImportError("REST 작업의 팀·파일 범위를 확인할 수 없어 자동 취소를 중단했습니다.");
      }
      const keys = [{ key: `viewfinder:multi-base:${job.id}`, kind: "기준 스냅샷" as const },
        ...job.files.map(f => ({ key: `viewfinder:multi-stage:${job.id}:${f.source.sourceId}`, kind: "파일별 임시 결과" as const }))];
      const values = await Promise.all(keys.map(k => store.get(k.key)));
      entries.push(...keys.map((k, i) => ({ ...k, value: values[i] ?? null })));
    }
    return { snapshot: { ...op, entries } satisfies Snapshot, job, draft };
  }
  async function savedBackup(team: SearchTeam, id: string) {
    const backup = await store.get<Backup>(backupKey(team, id));
    if (!backup || backup.review.id !== id || backup.review.team !== team || snapshotHash(backup.snapshot) !== backup.fingerprint) {
      throw new McpImportError("취소 백업을 검증하지 못했습니다. 기존 데이터를 보존하고 중단했습니다.");
    }
    return backup;
  }
  async function review(team: SearchTeam): Promise<RestCancelReview> {
    return locked(team, async () => {
      const active = await store.get<Active>(activeKey(team));
      if (active) {
        if (active.backup !== backupKey(team, active.id)) throw new McpImportError("취소 상태 확인이 필요합니다.");
        const backup = await savedBackup(team, active.id);
        return { ...backup.review, resuming: true };
      }
      const { snapshot, job, draft } = await capture(team);
      const result: RestCancelReview = { id: randomUUID(), team, existingScreens: snapshot.existingScreens,
        ...(job ? { job: { done: job.next, total: job.files.length, files: job.files.map(f => ({ name: f.source.name,
          status: f.status.status, screens: f.status.screens })) } } : {}),
        ...(draft ? { draftScreens: draft.screens.length } : {}),
        targets: snapshot.entries.filter(e => e.value !== null).map(({ key, kind }) => ({ key, kind })),
        expiresAt: new Date(now() + 15 * 60_000).toISOString(), canCancel: !!job || !!draft, resuming: false };
      await store.set(reviewKey(team), { review: result, fingerprint: snapshotHash(snapshot) } satisfies ReviewState);
      return result;
    });
  }
  async function cancel(team: SearchTeam, id: string): Promise<Receipt> {
    return locked(team, async () => {
      let active = await store.get<Active>(activeKey(team));
      const last = await store.get<Receipt>(receiptKey(team));
      if (!active && last?.id === id) return last; // 응답을 못 받은 뒤 재전송해도 새 작업을 지우지 않는다.
      let backup: Backup;
      if (active) {
        if (active.id !== id || active.backup !== backupKey(team, id)) throw new McpImportError("다른 취소 정리가 남아 있습니다. 취소 상태를 다시 확인해 주세요.");
        backup = await savedBackup(team, id);
      } else {
        const state = await store.get<ReviewState>(reviewKey(team));
        if (!state || state.review.id !== id || !state.review.canCancel || Date.parse(state.review.expiresAt) <= now()) {
          throw new McpImportError("취소 검토가 없거나 만료됐습니다. 상태를 다시 확인해 주세요.");
        }
        const { snapshot } = await capture(team);
        if (snapshotHash(snapshot) !== state.fingerprint) throw new McpImportError("검토 후 작업 또는 운영 데이터가 변경됐습니다. 상태를 다시 검토해 주세요.");
        const key = backupKey(team, id);
        if (!await store.get(key)) await store.set(key, { ...state, snapshot } satisfies Backup);
        backup = await savedBackup(team, id); // 백업 저장 후 다시 읽어 확인한 뒤에만 삭제 가능
        if (backup.fingerprint !== state.fingerprint) throw new McpImportError("검토와 백업이 다릅니다.");
        active = { id, backup: key };
        await store.set(activeKey(team), active); // 실패 중 REST 재개·MCP 반영을 막는 영구 표식
      }
      const op = await operation(team);
      if (op.indexHash !== backup.snapshot.indexHash) throw new McpImportError("운영 데이터가 변경됐습니다. 자동 취소를 중단했습니다.");
      const values = await Promise.all(backup.snapshot.entries.map(e => store.get(e.key)));
      for (const [i, entry] of backup.snapshot.entries.entries()) {
        if (values[i] !== undefined && values[i] !== null && snapshotHash(values[i]) !== snapshotHash(entry.value)) {
          throw new McpImportError("백업 이후 취소 대상이 변경됐습니다. 변경된 데이터는 삭제하지 않습니다.");
        }
      }
      // 작업을 마지막에 지운다. 중단되어도 active 표식이 남아 재개와 MCP를 막는다.
      const targets = backup.snapshot.entries.filter(e => e.value !== null).sort((a, b) => Number(a.kind === "작업") - Number(b.kind === "작업"));
      for (const entry of targets) await store.del(entry.key);
      const remains = await Promise.all(targets.map(e => store.get(e.key)));
      if (remains.some(v => v !== undefined && v !== null)) throw new McpImportError("정리가 완료되지 않았습니다. 같은 취소를 다시 실행해 주세요.");
      const result: Receipt = { id, cancelled: true, backup: backupKey(team, id), completedAt: new Date(now()).toISOString(), removed: targets.length };
      await store.set(receiptKey(team), result);
      await store.del(reviewKey(team));
      await store.del(activeKey(team));
      return result;
    });
  }
  return { review, cancel };
}
