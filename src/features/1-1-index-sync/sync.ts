import type { ExcludedFrame, IndexedScreen, TeamIndex, TeamPage } from "../../lib/types";
import { PD_FILE_KEY, TEAM_PAGE_NODE_IDS } from "./config";
import { nodeToScreens, type FigmaNodeResponse } from "./convert";
import { figmaGet, loadMdsKeys } from "./figma-library";
import type { MdsKeys, MdsVersion } from "./mds";
import { getStore } from "./store";

/**
 * 팀 페이지 하나를 다시 동기화합니다. (Figma는 읽기만 합니다.)
 *
 * 1. planSync: 페이지 아래 구역·프레임 목록(계획)을 만들어 저장한다.
 * 2. runSyncStep: 시간 예산 안에서 구역을 하나씩 읽어 임시로 쌓는다. 끝나지 않았으면 다시 호출해 이어서 한다.
 * 3. 전부 읽으면 임시로 쌓은 것을 합쳐 검색 인덱스를 한 번에 교체한다. (끝나기 전에는 이전 인덱스가 그대로 쓰인다.)
 *
 * 같은 팀 페이지의 이어 읽기는 동시에 한 번만 실행된다. (runSyncStep이 잠금을 걸고, 오래 걸리거나 멈춰도 잠금은 시간이 지나면 풀린다.)
 */

interface PageChild {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
}

interface SyncJob {
  startedAt: string;
  items: { id: string; name: string; type: string }[];
  nextIndex: number;
  lockedUntil?: number; // 이어 읽기를 실행 중인 동안 다른 실행을 막는 시각 (ms)
}

interface StoredMdsKeys {
  components: [string, MdsVersion][];
  styles: string[];
}

interface StagedItem {
  screens: IndexedScreen[];
  excluded: ExcludedFrame[];
}

export interface SyncProgress {
  team: TeamPage;
  done: number;
  total: number;
  finished: boolean;
}

/** 같은 팀 페이지의 이어 읽기가 이미 실행 중일 때 */
export class SyncBusyError extends Error {
  constructor() {
    super("이 팀 페이지의 동기화가 이미 실행 중입니다. 잠시 뒤 다시 시도하세요.");
  }
}

/** 시작하지 않은(또는 이미 끝난) 동기화를 이어 읽으려 할 때 */
export class SyncNotStartedError extends Error {
  constructor() {
    super("진행 중인 동기화가 없습니다. 먼저 동기화를 시작하세요.");
  }
}

const LOCK_MARGIN_MS = 30_000; // 예산을 넘겨 끝나는 마지막 구역과 저장 시간

const jobKey = (team: TeamPage) => `viewfinder:job:${team}`;
const mdsKeysKey = "viewfinder:mds-keys";
const stageKey = (team: TeamPage, id: string) => `viewfinder:stage:${team}:${id}`;
export const indexKey = (team: TeamPage) => `viewfinder:index:${team}`;

/** 동기화를 새로 시작한다. 진행 중이던 것이 있으면 처음부터 다시 한다. */
export async function planSync(team: TeamPage, figmaToken: string): Promise<SyncProgress> {
  const store = getStore();
  const pageId = TEAM_PAGE_NODE_IDS[team];
  const response = await figmaGet<{ nodes: Record<string, { document: { children?: PageChild[] } } | null> }>(
    `/v1/files/${PD_FILE_KEY}/nodes?ids=${encodeURIComponent(pageId)}&depth=1`,
    figmaToken,
  );
  const children = response.nodes[pageId]?.document.children;
  if (!children) throw new Error(`Figma에서 ${team} 페이지(${pageId})를 읽지 못했습니다.`);

  // 구역과 페이지에 바로 놓인 프레임만 읽는다. (아이콘, 글자 조각 등은 화면이 아니다)
  const items = children
    .filter((child) => child.visible !== false && (child.type === "SECTION" || child.type === "FRAME"))
    .map(({ id, name, type }) => ({ id, name, type }));

  const previous = await store.get<SyncJob>(jobKey(team));
  for (const item of previous?.items ?? []) await store.del(stageKey(team, item.id));

  // MDS 대조 목록은 동기화를 시작할 때 한 번만 가져와 저장하고, 이어서 실행할 때마다 다시 가져오지 않는다.
  const mdsKeys = await loadMdsKeys(figmaToken);
  await store.set(mdsKeysKey, {
    components: [...mdsKeys.components],
    styles: [...mdsKeys.styles],
  } satisfies StoredMdsKeys);

  await store.set(jobKey(team), { startedAt: new Date().toISOString(), items, nextIndex: 0 } satisfies SyncJob);
  return { team, done: 0, total: items.length, finished: false };
}

/**
 * 시간 예산(budgetMs) 안에서 남은 구역을 읽는다. 구역 하나를 읽는 데 3~7초 걸리고,
 * 예산을 넘기면 새 구역을 시작하지 않으므로 호출하는 쪽의 제한 시간은 예산보다 10초쯤 넉넉해야 한다.
 */
export async function runSyncStep(team: TeamPage, figmaToken: string, budgetMs = 40_000): Promise<SyncProgress> {
  const store = getStore();
  const job = await store.get<SyncJob>(jobKey(team));
  if (!job) throw new SyncNotStartedError();
  if (job.lockedUntil && Date.now() < job.lockedUntil) throw new SyncBusyError();

  const startedAt = Date.now();
  const storedKeys = await store.get<StoredMdsKeys>(mdsKeysKey);
  if (!storedKeys) throw new Error("MDS 대조 목록이 없습니다. planSync부터 다시 실행하세요.");
  const mdsKeys: MdsKeys = { components: new Map(storedKeys.components), styles: new Set(storedKeys.styles) };

  job.lockedUntil = startedAt + budgetMs + LOCK_MARGIN_MS;
  await store.set(jobKey(team), job);

  try {
    while (job.nextIndex < job.items.length && Date.now() - startedAt < budgetMs) {
      const item = job.items[job.nextIndex];
      const response = await figmaGet<{ nodes: Record<string, FigmaNodeResponse | null> }>(
        `/v1/files/${PD_FILE_KEY}/nodes?ids=${encodeURIComponent(item.id)}`,
        figmaToken,
      );
      const node = response.nodes[item.id];
      const staged: StagedItem = node
        ? nodeToScreens(node, { fileKey: PD_FILE_KEY, teamPage: team, syncedAt: job.startedAt, mdsKeys })
        : { screens: [], excluded: [{ id: item.id, name: item.name, reason: "Figma에서 읽지 못함" }] };

      await store.set(stageKey(team, item.id), { screens: staged.screens, excluded: staged.excluded } satisfies StagedItem);
      job.nextIndex += 1;
      await store.set(jobKey(team), job);
    }
  } finally {
    // 성공하든 실패하든 잠금을 풀어 다음 이어 읽기가 바로 할 수 있게 한다.
    job.lockedUntil = undefined;
    await store.set(jobKey(team), job);
  }

  const progress: SyncProgress = { team, done: job.nextIndex, total: job.items.length, finished: false };
  if (job.nextIndex < job.items.length) return progress;

  await publishIndex(team, job);
  return { ...progress, finished: true };
}

/** 임시로 쌓은 구역별 결과를 합쳐 검색 인덱스를 교체하고, 임시 데이터를 지운다. */
async function publishIndex(team: TeamPage, job: SyncJob) {
  const store = getStore();
  const screens = new Map<string, IndexedScreen>();
  const excluded: ExcludedFrame[] = [];

  for (const item of job.items) {
    const staged = await store.get<StagedItem>(stageKey(team, item.id));
    if (!staged) throw new Error(`임시 결과가 없습니다: ${item.name} (${item.id}). planSync부터 다시 실행하세요.`);
    for (const screen of staged.screens) screens.set(screen.id, screen);
    excluded.push(...staged.excluded);
  }

  await store.set(indexKey(team), {
    team,
    syncedAt: job.startedAt,
    screens: [...screens.values()],
    excluded,
  } satisfies TeamIndex);

  for (const item of job.items) await store.del(stageKey(team, item.id));
  await store.del(jobKey(team));
}

/** 진행 중인 동기화가 있으면 어디까지 읽었는지. 없으면 undefined */
export async function getSyncProgress(team: TeamPage): Promise<SyncProgress | undefined> {
  const job = await getStore().get<SyncJob>(jobKey(team));
  return job ? { team, done: job.nextIndex, total: job.items.length, finished: false } : undefined;
}

/** 현재 검색 인덱스. 아직 동기화한 적이 없으면 undefined */
export async function getTeamIndex(team: TeamPage): Promise<TeamIndex | undefined> {
  return getStore().get<TeamIndex>(indexKey(team));
}
