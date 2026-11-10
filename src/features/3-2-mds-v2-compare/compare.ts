import {
  findCandidatesByConditions,
  toSearchConditions,
} from "../2-1-search/candidate-search";
import type { IndexedScreen, SearchResult } from "../../lib/types";

export interface MdsUsage {
  name: string;
  variant?: string;
  /** 이전 인덱스에는 요소별 토큰 정보가 없습니다. */
  tokens: string[] | null;
}

export interface MdsCaseCandidate {
  id: string;
  screen: IndexedScreen;
  usages: MdsUsage[];
}

const MAX_CANDIDATES = 24;
const GENERIC_CONDITIONS = new Set(["frame", "모바일", "PC"]);

function screenId(screen: IndexedScreen): string {
  return `${screen.fileKey}/${screen.id}`;
}

function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase();
}

export function getMdsV2Usages(screen: IndexedScreen): MdsUsage[] {
  const source = screen.elements === undefined
    ? screen.components
      .filter(({ isMds, mdsVersion }) => isMds && mdsVersion === "v2")
      .map(({ name, variant }) => ({ name, variant, tokens: null }))
    : screen.elements
      .filter(({ mdsVersion }) => mdsVersion === "v2")
      .map(({ component, variant, tokens }) => ({ name: component, variant, tokens }));

  const usages = new Map<string, MdsUsage>();
  for (const { name, variant, tokens } of source) {
    const key = JSON.stringify([normalizeName(name), normalizeName(variant ?? "")]);
    const previous = usages.get(key);
    usages.set(key, {
      name: previous?.name ?? name,
      variant: previous?.variant ?? variant,
      tokens: tokens === null ? null : [...new Set([...(previous?.tokens ?? []), ...tokens])],
    });
  }
  return [...usages.values()];
}

export function getComparableComponentNames(screen: IndexedScreen): string[] {
  const names = screen.elements === undefined
    ? screen.components.filter(({ isMds, mdsVersion }) => isMds && mdsVersion).map(({ name }) => name)
    : screen.elements.map(({ component }) => component);
  const distinct = new Map<string, string>();
  for (const name of names) {
    const key = normalizeName(name);
    if (key && !distinct.has(key)) distinct.set(key, name);
  }
  return [...distinct.values()];
}

/** AI가 검토할 수 있도록, 문맥과 겹치는 실제 MDS v2 사례를 먼저 전달합니다. */
export function getMdsV2Cases(
  result: SearchResult,
  screens: readonly IndexedScreen[],
  component?: string,
): MdsCaseCandidate[] {
  const source = result.screen;
  const excluded = new Set([screenId(source)]);
  const focusedName = normalizeName(component ?? "");
  const candidates: MdsCaseCandidate[] = [];
  for (const screen of screens) {
    const id = screenId(screen);
    if (excluded.has(id)) continue;
    const usages = getMdsV2Usages(screen);
    if (usages.length === 0 || (focusedName && !usages.some(({ name }) => normalizeName(name) === focusedName))) continue;
    candidates.push({ id, screen, usages });
    excluded.add(id);
  }

  const conditions = [result.summary, source.section, source.name, ...source.texts.slice(0, 8)]
    .flatMap((value) => value ? toSearchConditions(value) : [])
    .filter(({ label }) => !GENERIC_CONDITIONS.has(label) && !/^\d+$/.test(label));
  const scores = new Map(findCandidatesByConditions(
    candidates.map(({ screen }) => screen),
    conditions,
    { limit: candidates.length },
  ).map(({ screen, score }) => [screenId(screen), score]));
  const sourceNames = new Set(getComparableComponentNames(source).map(normalizeName));

  const ranked = candidates.map((candidate) => {
    const names = new Set(candidate.usages.map(({ name }) => normalizeName(name)));
    return {
      candidate,
      score: scores.get(candidate.id) ?? 0,
      sharedComponents: [...names].filter((name) => sourceNames.has(name)).length,
    };
  });

  return ranked
    .sort((a, b) => b.score - a.score || b.sharedComponents - a.sharedComponents)
    .slice(0, MAX_CANDIDATES)
    .map(({ candidate }) => candidate);
}
