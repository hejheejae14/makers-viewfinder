import type { TeamIndex, TeamPage } from "../../lib/types";
import { canonicalTeam } from "../../lib/screen-identity";
import type { KvStore } from "./store";

/** REST 동기화와 MCP 가져오기가 같은 팀 인덱스를 동시에 쓰지 못하게 한다. */
export async function withIndexLock<T>(store: KvStore, team: TeamPage, work: () => Promise<T>, busy: () => Error) {
  const owner = crypto.randomUUID();
  const lock = `viewfinder:multi-lock:${canonicalTeam(team)}`;
  if (!await store.acquireLock(lock, owner, 180_000)) throw busy();
  try { return await work(); } finally { await store.releaseLock(lock, owner); }
}

export async function backupIndex(store: KvStore, team: TeamPage, revision: string, index: TeamIndex | undefined) {
  const key = `viewfinder:multi-backup:${canonicalTeam(team)}:${revision}`;
  if (!await store.get(key)) await store.set(key, { index: index ?? null });
  return key;
}
