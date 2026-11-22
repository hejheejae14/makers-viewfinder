import { createSyncEngine } from "./sync-engine";
import { getStore } from "./store";
import { figmaGet, loadMdsKeys } from "./figma-library";
import type { TeamPage } from "../../lib/types";
export { indexKey, SyncBusyError, SyncNotStartedError } from "./sync-engine";
export type { SyncProgress } from "./sync-engine";

const engine = () => createSyncEngine({ store: getStore(), get: figmaGet, loadMds: loadMdsKeys });
export const planSync = (team: TeamPage, token: string, retryOnly = false) => engine().planSync(team, token, retryOnly);
export const runSyncStep = (team: TeamPage, token: string, budgetMs?: number) => engine().runSyncStep(team, token, budgetMs);
export const getSyncProgress = (team: TeamPage) => engine().getSyncProgress(team);
export const getTeamIndex = (team: TeamPage) => engine().getTeamIndex(team);
export const getDraft = (team: TeamPage) => engine().getDraft(team);
export const publishDraft = (team: TeamPage) => engine().publishDraft(team);
