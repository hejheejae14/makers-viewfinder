import type { ExcludedFrame, FileSyncStatus, IndexedScreen, TeamIndex, TeamPage } from "../../lib/types";
import { canonicalTeam, screenIdentity } from "../../lib/screen-identity";
import { nodeToScreens, type FigmaNodeResponse } from "./convert";
import { getFileSources, TEAM_FOLDERS, type FileSource } from "./file-registry";
import { PD_FILE_KEY, TEAM_PAGE_NODE_IDS } from "./config";
import { mergeLegacyIndexes } from "./index-merge";
import type { MdsKeys, MdsVersion } from "./mds";
import type { KvStore } from "./store";

interface Item { id: string; pageId: string; pageName: string }
interface Snapshot { screens: IndexedScreen[]; excluded: ExcludedFrame[]; version?: string; lastModified?: string }
interface WorkFile { source: FileSource; status: FileSyncStatus; items?: Item[]; next: number }
interface Job { id: string; startedAt: string; files: WorkFile[]; next: number; retryAt?: number; mds: { components: [string, MdsVersion][]; styles: string[] } }
interface RootResponse { name: string; version?: string; lastModified?: string; document: { children?: { id: string; name: string; visible?: boolean; children?: { id: string; visible?: boolean; type: string }[] }[] } }
export interface SyncProgress { team: TeamPage; done: number; total: number; finished: boolean; draftReady?: boolean; files?: FileSyncStatus[] }
export class SyncBusyError extends Error { constructor() { super("이 팀의 동기화가 실행 중이에요. 잠시 뒤 다시 시도해 주세요."); } }
export class SyncNotStartedError extends Error { constructor() { super("진행 중인 동기화가 없어요. 먼저 동기화를 시작해 주세요."); } }
export const indexKey = (team: TeamPage) => `viewfinder:index:${team}`;
const jobKey = (team: TeamPage) => `viewfinder:multi-job:${canonicalTeam(team)}`;
const draftKey = (team: TeamPage) => `viewfinder:multi-draft:${canonicalTeam(team)}`;
const cooldownKey = (team: TeamPage) => `viewfinder:figma-cooldown:${canonicalTeam(team)}`;
const stageKey = (job: Job, source: FileSource) => `viewfinder:multi-stage:${job.id}:${source.sourceId}`;

/** 테스트는 메모리 저장소·가짜 GET만 주입한다. 운영 저장소에 접근하지 않는다. */
export function createSyncEngine(deps: {
  store: KvStore;
  get: <T>(path: string, token: string) => Promise<T>;
  loadMds: (token: string) => Promise<MdsKeys>;
  sources?: (team: TeamPage) => FileSource[];
  now?: () => number;
}) {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const sourcesFor = deps.sources ?? getFileSources;
  async function checkCooldown(team: TeamPage) {
    const until = await store.get<number>(cooldownKey(team));
    if (until && until > now()) throw new Error(`Figma 요청 제한. ${Math.ceil((until - now()) / 1000)}초 후 다시 시도해 주세요.`);
  }
  const progress = (job: Job, team: TeamPage, finished = false): SyncProgress => ({ team: canonicalTeam(team), done: job.next,
    total: job.files.length, finished, draftReady: finished, files: job.files.map((f) => f.status) });
  async function locked<T>(team: TeamPage, work: () => Promise<T>) {
    const owner = crypto.randomUUID();
    const lock = `viewfinder:multi-lock:${canonicalTeam(team)}`;
    if (!await store.acquireLock(lock, owner, 180_000)) throw new SyncBusyError();
    try { return await work(); } finally { await store.releaseLock(lock, owner); }
  }
  async function getTeamIndex(team: TeamPage) {
    const scope = canonicalTeam(team);
    const current = await store.get<TeamIndex>(indexKey(scope));
    const admin = scope === "공홈" ? await store.get<TeamIndex>(indexKey("어드민")) : undefined;
    return mergeLegacyIndexes(scope, current, admin);
  }
  async function planSync(team: TeamPage, token: string, retryOnly = false) {
    return locked(team, async () => {
      if (await store.get<Job>(jobKey(team))) throw new SyncBusyError();
      await checkCooldown(team);
      const previous = await getTeamIndex(team);
      const oldDraft = await store.get<TeamIndex>(draftKey(team));
      let mds: MdsKeys;
      try { mds = await deps.loadMds(token); }
      catch (error) {
        if ((error as { code?: string }).code === "rate-limit") await store.set(cooldownKey(team), now() + Math.max((error as { retryAfter?: number }).retryAfter ?? 60, 1) * 1000);
        throw error;
      }
      const sources = sourcesFor(team);
      const seen = new Set<string>();
      for (const source of sources) {
        if (source.team !== canonicalTeam(team) || seen.has(source.sourceId)) throw new Error("파일 레지스트리의 팀·중복 설정을 확인해 주세요.");
        if (source.role === "archive" ? source.fileKey !== PD_FILE_KEY || !source.originalTeam || canonicalTeam(source.originalTeam) !== source.team
          || source.pageIds?.length !== 1 || source.pageIds[0] !== TEAM_PAGE_NODE_IDS[source.originalTeam]
          : source.folderId !== TEAM_FOLDERS[source.team]) throw new Error("허용되지 않은 폴더·아카이브 범위입니다.");
        seen.add(source.sourceId);
      }
      const failed = new Set((oldDraft?.files ?? previous?.files ?? []).filter((f) => f.status === "failed" || f.status === "review").map((f) => f.sourceId));
      const selected = retryOnly ? sources.filter((s) => failed.has(s.sourceId)) : sources;
      if (!selected.length) throw new Error("다시 시도할 실패·검토 파일이 없어요.");
      const job: Job = { id: crypto.randomUUID(), startedAt: new Date(now()).toISOString(), next: 0,
        mds: { components: [...mds.components], styles: [...mds.styles] }, files: selected.map((source) => ({ source, next: 0,
          status: { sourceId: source.sourceId, fileKey: source.fileKey, fileName: source.name, folderId: source.folderId, status: "pending", screens: 0 } })) };
      // 재시도 시 성공한 임시 결과를 보존한다. 검색 인덱스는 아직 변경하지 않는다.
      await store.set(`viewfinder:multi-base:${job.id}`, oldDraft ?? previous ?? { team: canonicalTeam(team), syncedAt: job.startedAt, screens: [], excluded: [] });
      await store.set(jobKey(team), job);
      return progress(job, team);
    });
  }
  async function runSyncStep(team: TeamPage, token: string, budgetMs = 30_000) {
    return locked(team, async () => {
      const job = await store.get<Job>(jobKey(team));
      if (!job) throw new SyncNotStartedError();
      await checkCooldown(team);
      if (job.retryAt && job.retryAt > now()) throw new Error(`Figma 요청 제한. ${Math.ceil((job.retryAt - now()) / 1000)}초 후 이어서 동기화해 주세요.`);
      job.retryAt = undefined;
      const started = now();
      const keys: MdsKeys = { components: new Map(job.mds.components), styles: new Set(job.mds.styles) };
      // 구역을 하나씩 처리한다. 메타데이터도 이 단계에서 가져와 start 요청의 시간 초과를 막는다.
      do {
        const file = job.files[job.next];
        if (!file) break;
        const { source } = file;
        try {
          if (!file.items) {
            const root = await deps.get<RootResponse>(`/v1/files/${source.fileKey}?depth=2`, token);
            if (!root.document?.children) throw new Error("파일 페이지 목록을 읽지 못함");
            file.status.fileName = root.name || source.name;
            file.status.version = root.version;
            file.status.lastModified = root.lastModified;
            const base = await store.get<TeamIndex>(`viewfinder:multi-base:${job.id}`);
            const old = base?.files?.find((f) => f.sourceId === source.sourceId);
            if (source.role !== "library-review" && old && ["success", "unchanged"].includes(old.status) && root.version && old.version === root.version) {
              file.status = { ...old, fileName: root.name || source.name, lastModified: root.lastModified, status: "unchanged" }; job.next++;
            } else {
              const pages = root.document.children.filter((p) => p.visible !== false && (!source.pageIds || source.pageIds.includes(p.id)));
              if (source.pageIds?.some((id) => !pages.some((p) => p.id === id))) throw new Error("아카이브의 지정 페이지를 확인하지 못함");
              file.items = pages.flatMap((p) => (p.children ?? []).filter((c) => c.visible !== false && ["SECTION", "FRAME", "GROUP"].includes(c.type))
                .map((c) => ({ id: c.id, pageId: p.id, pageName: p.name })));
              await store.set(stageKey(job, source), { screens: [], excluded: [], version: root.version, lastModified: root.lastModified } satisfies Snapshot);
            }
          } else if (file.next < file.items.length) {
            const item = file.items[file.next];
            const response = await deps.get<{ nodes: Record<string, FigmaNodeResponse | null> }>(`/v1/files/${source.fileKey}/nodes?ids=${encodeURIComponent(item.id)}`, token);
            const node = response.nodes[item.id];
            if (!node) throw new Error("등록된 구역을 읽지 못함. 파일이 변경되었거나 접근할 수 없음");
            const converted = nodeToScreens(node, { fileKey: source.fileKey, fileName: file.status.fileName, sourceId: source.sourceId,
              pageId: item.pageId, pageName: item.pageName, originalTeam: source.originalTeam,
              teamPage: source.team, syncedAt: job.startedAt, mdsKeys: keys });
            const staged = await store.get<Snapshot>(stageKey(job, source));
            if (!staged) throw new Error("임시 파일 결과가 없음");
            staged.screens.push(...converted.screens); staged.excluded.push(...converted.excluded);
            await store.set(stageKey(job, source), staged); file.next++;
          } else {
            // 파일이 읽는 중 바뀌면 서로 다른 버전의 구역을 섞어 반영하지 않는다.
            const latest = await deps.get<RootResponse>(`/v1/files/${source.fileKey}?depth=1`, token);
            if (file.status.version && latest.version !== file.status.version) throw new Error("동기화 도중 파일이 변경됨. 다시 시도해 주세요.");
            const staged = await store.get<Snapshot>(stageKey(job, source));
            file.status.screens = new Set(staged?.screens.map(screenIdentity)).size;
            file.status.status = source.role === "library-review" || !file.status.screens ? "review" : "success";
            file.status.message = source.role === "library-review" ? "라이브러리 파일: 서비스 화면 포함 여부 검토 필요" : !file.status.screens ? "화면 판정 기준에 맞는 프레임 없음. 내부 구조 검토 필요" : undefined;
            file.status.syncedAt = job.startedAt; job.next++;
          }
        } catch (error) {
          const code = (error as { code?: FileSyncStatus["errorCode"] }).code ?? "request";
          file.status.status = "failed"; file.status.errorCode = code;
          if (code === "rate-limit") {
            job.retryAt = now() + Math.max((error as { retryAfter?: number }).retryAfter ?? 60, 1) * 1000;
            await store.set(cooldownKey(team), job.retryAt);
          }
          // 응답 본문·인증 값은 보관하지 않는다.
          file.status.message = code === "not-found-or-inaccessible" ? "404: 삭제 또는 접근 불가. 삭제로 확정하지 않고 이전 결과 보존" : code === "forbidden" ? "403: 파일 접근 권한 없음" : code === "authentication" ? "401: 인증 확인 필요" : code === "rate-limit" ? "429: 요청 제한. 나중에 재시도" : "파일 조회·변환 실패 또는 읽는 중 변경됨. 재시도 필요";
          job.next++;
        }
        await store.set(jobKey(team), job);
      } while (job.next < job.files.length && now() - started < budgetMs && !job.retryAt);
      if (job.next < job.files.length) return progress(job, team);
      const base = await store.get<TeamIndex>(`viewfinder:multi-base:${job.id}`);
      const screens = new Map((base?.screens ?? []).map((s) => [screenIdentity(s), s]));
      let excluded = base?.excluded ?? [];
      const statuses = new Map((base?.files ?? []).map((f) => [f.sourceId, f]));
      for (const file of job.files) {
        const retained = [...screens.values()].some((s) => s.sourceId === file.source.sourceId);
        file.status.retainedPrevious = retained && ["failed", "review"].includes(file.status.status);
        if (file.status.status === "unchanged") {
          for (const [key, screen] of screens) if (screen.sourceId === file.source.sourceId) {
            screens.set(key, { ...screen, fileName: file.status.fileName,
              cohortLabels: [...new Set(`${file.status.fileName} ${screen.pageName ?? ""}`.match(/\d+\s*기/g) ?? [])] });
          }
        }
        if (file.status.status === "success") {
          for (const [key, screen] of screens) if (screen.sourceId === file.source.sourceId) screens.delete(key);
          excluded = excluded.filter((f) => f.sourceId !== file.source.sourceId);
          const staged = await store.get<Snapshot>(stageKey(job, file.source));
          if (!staged) throw new Error("완료된 파일의 임시 결과가 없어요.");
          for (const screen of staged.screens) screens.set(screenIdentity(screen), screen);
          excluded.push(...staged.excluded);
        }
        statuses.set(file.source.sourceId, file.status);
      }
      await store.set(draftKey(team), { team: canonicalTeam(team), syncedAt: job.startedAt, screens: [...screens.values()], excluded,
        files: [...statuses.values()] } satisfies TeamIndex);
      // 임시 인덱스 저장 뒤 작업을 먼저 완료 처리한다. 청소 도중 중단되어도 재개가 깨지지 않는다.
      await store.del(jobKey(team));
      for (const file of job.files) await store.del(stageKey(job, file.source));
      await store.del(`viewfinder:multi-base:${job.id}`);
      return progress(job, team, true);
    });
  }
  async function publishDraft(team: TeamPage) {
    return locked(team, async () => {
      if (await store.get<Job>(jobKey(team))) throw new SyncBusyError();
      const draft = await store.get<TeamIndex>(draftKey(team));
      if (!draft) throw new Error("검토할 임시 인덱스가 없어요.");
      // 기존 어드민 키는 남겨 둔다. 읽기 호환에서도 계속 보존된다.
      const previous = await getTeamIndex(team);
      const backupKey = `viewfinder:multi-backup:${canonicalTeam(team)}:${draft.syncedAt}`;
      if (!await store.get(backupKey)) await store.set(backupKey, { index: previous ?? null });
      await store.set(indexKey(canonicalTeam(team)), draft);
      await store.del(draftKey(team));
      return { published: true, screens: draft.screens.length, files: draft.files };
    });
  }
  return { getTeamIndex, planSync, runSyncStep, publishDraft,
    getDraft: (team: TeamPage) => store.get<TeamIndex>(draftKey(team)),
    getSyncProgress: async (team: TeamPage) => { const job = await store.get<Job>(jobKey(team)); return job ? progress(job, team) : undefined; } };
}
