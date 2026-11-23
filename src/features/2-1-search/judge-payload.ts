import type { IndexedScreen, TeamPage } from "../../lib/types";
import type { AiCandidate, EvidenceAtom, SearchCondition } from "./search-model";
import { conditionMatches, getEvidence } from "./evidence";
import { GeminiSearchError } from "./gemini-error";

// 전송 JSON의 문자 수 한도다. 토큰 수나 모델의 컨텍스트 한도를 의미하지 않는다.
export const MAX_JUDGE_INPUT_CHARS = 60_000;
export const MAX_CANDIDATE_CHARS = 12_000;
interface WireCandidate {
  screenId: string;
  structure?: AiCandidate["structure"];
  frame?: AiCandidate["frame"];
  evidence: EvidenceAtom[];
  elementBoxes: { owner: string; box: NonNullable<IndexedScreen["elements"]>[number]["box"] }[];
  coverage: { totalEvidence: number; omittedEvidence: number; omittedBoxes: number };
}
export interface JudgePayloadStats { inputChars: number; candidateCount: number; limitedCandidates: number; omittedEvidence: number }

function atomsFor(candidate: AiCandidate, team?: TeamPage) {
  if (candidate.evidence) return candidate.evidence;
  // 이전 호출자도 동일한 ref 형식을 쓴다. 원본 필드와 근거를 동시에 보내지 않는다.
  return getEvidence({ ...candidate, teamPage: team ?? "앱", id: candidate.screenId, fileKey: "", figmaUrl: "", syncedAt: "" })
    .filter(a => team !== undefined || a.ref !== "team");
}
function pack(candidate: AiCandidate, atoms: EvidenceAtom[], budget: number, conditions: SearchCondition[]): WireCandidate {
  const boxes = (candidate.elements ?? []).map((e, i) => ({ owner: `elements/${i}`, box: e.box }));
  const make = (selected: Set<string>): WireCandidate => {
    const evidence = atoms.filter(a => selected.has(a.ref));
    const owners = new Set(evidence.map(a => a.owner));
    const elementBoxes = boxes.filter(b => owners.has(b.owner));
    return { screenId: candidate.screenId, structure: candidate.structure, frame: candidate.frame, evidence, elementBoxes,
      coverage: { totalEvidence: atoms.length, omittedEvidence: atoms.length - evidence.length, omittedBoxes: boxes.length - elementBoxes.length } };
  };
  const complete = make(new Set(atoms.map(a => a.ref)));
  if (JSON.stringify(complete).length <= budget) return complete;
  const selected = new Set<string>();
  const byRef = new Map(atoms.map(a => [a.ref, a]));
  const sizes = new Map(atoms.map(a => [a.ref, JSON.stringify(a).length]));
  const anchors = new Map<string, string[]>();
  for (const a of atoms) if (a.owner && a.source !== "화면 속 텍스트" && a.source !== "토큰") anchors.set(a.owner, [...(anchors.get(a.owner) ?? []), a.ref]);
  const boxByOwner = new Map(boxes.map(b => [b.owner, b]));
  const selectedBoxes = new Set<string>();
  const baseSize = JSON.stringify(make(selected)).length;
  let evidenceSize = 0, boxesSize = 0;
  // 각 조건의 단서가 먼저 한 번씩 검토되게 해 하나의 흔한 단어가 공간을 독점하지 않게 한다.
  const priorities: EvidenceAtom[] = [];
  const matched = conditions.map(c => atoms.filter(a => conditionMatches(a, c)));
  const largest = Math.max(0, ...matched.map(a => a.length));
  for (let i = 0; i < largest; i++) for (const group of matched) if (group[i]) priorities.push(group[i]);
  priorities.push(...atoms.filter(a => a.strength === "hint" || a.ref === "team"),
    ...atoms.filter(a => a.source === "variant"), ...atoms);
  const tried = new Set<string>();
  for (const atom of priorities) {
    if (tried.has(atom.ref)) continue;
    tried.add(atom.ref);
    const refs = [atom.ref];
    // 속성만 떼어 보내지 않는다. 같은 owner의 이름·variant·라이브러리와 위치를 함께 유지한다.
    if (atom.owner) refs.push(...(anchors.get(atom.owner) ?? []));
    const additions = [...new Set(refs)].filter(ref => !selected.has(ref));
    const owners = new Set(additions.map(ref => byRef.get(ref)?.owner).filter((o): o is string => !!o && boxByOwner.has(o) && !selectedBoxes.has(o)));
    const addedEvidenceSize = additions.reduce((n, ref) => n + sizes.get(ref)!, 0);
    const addedBoxSize = [...owners].reduce((n, owner) => n + JSON.stringify(boxByOwner.get(owner)).length, 0);
    const count = selected.size + additions.length, boxCount = selectedBoxes.size + owners.size;
    const size = baseSize + evidenceSize + addedEvidenceSize + Math.max(0, count - 1) + boxesSize + addedBoxSize + Math.max(0, boxCount - 1)
      + String(atoms.length - count).length - String(atoms.length).length + String(boxes.length - boxCount).length - String(boxes.length).length;
    if (size <= budget) {
      for (const ref of additions) selected.add(ref);
      for (const owner of owners) selectedBoxes.add(owner);
      evidenceSize += addedEvidenceSize; boxesSize += addedBoxSize;
    }
  }
  return make(selected);
}

/** 후보 ID·원문 ref는 유지한다. 문자열을 잘라 새 근거로 만들거나 후보를 제거하지 않는다. */
export function prepareJudgeInput(query: string, candidates: AiCandidate[], conditions: SearchCondition[] = [], team?: TeamPage) {
  const envelope = (wire: WireCandidate[]) => ({ query: query.trim(), selectedTeam: team, conditions, candidates: wire });
  if (candidates.length > 60) throw new GeminiSearchError("payload", "judge", "판정 후보가 한도를 초과했어요.", "candidates");
  const atoms = candidates.map(c => atomsFor(c, team));
  const empty = candidates.map((c, i): WireCandidate => ({ screenId: c.screenId, structure: c.structure, frame: c.frame,
    evidence: [], elementBoxes: [], coverage: { totalEvidence: atoms[i].length, omittedEvidence: atoms[i].length, omittedBoxes: c.elements?.length ?? 0 } }));
  const baseChars = JSON.stringify(envelope(empty)).length;
  if (baseChars > MAX_JUDGE_INPUT_CHARS) throw new GeminiSearchError("payload", "judge", "검색 조건이 너무 길어 요청을 보내지 않았어요. 검색어를 나눠 주세요.", "conditions");
  const share = Math.floor((MAX_JUDGE_INPUT_CHARS - baseChars) / Math.max(1, candidates.length));
  const wire = candidates.map((c, i) => pack(c, atoms[i], Math.min(MAX_CANDIDATE_CHARS, JSON.stringify(empty[i]).length + share), conditions));
  const input = JSON.stringify(envelope(wire));
  if (input.length > MAX_JUDGE_INPUT_CHARS) throw new GeminiSearchError("payload", "judge", "검색 요청 크기 한도를 초과해 전송을 중단했어요.", "candidates");
  const stats: JudgePayloadStats = { inputChars: input.length, candidateCount: candidates.length,
    limitedCandidates: wire.filter(c => c.coverage.omittedEvidence > 0 || c.coverage.omittedBoxes > 0).length,
    omittedEvidence: wire.reduce((n, c) => n + c.coverage.omittedEvidence, 0) };
  return { input, stats, coverage: wire.map(c => ({ screenId: c.screenId, providedEvidenceRefs: c.evidence.map(a => a.ref),
    evidenceIncomplete: c.coverage.omittedEvidence > 0 || c.coverage.omittedBoxes > 0 })) };
}
