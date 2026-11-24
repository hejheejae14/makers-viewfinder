import type { SearchResult, TeamPage } from "../../lib/types";
import type { SearchCandidate } from "./candidate-search";
import type { AiCandidate, AiJudgement, ConditionCheck, EvidenceAtom, SearchCondition } from "./search-model";
import { conditionMatches, getEvidence } from "./evidence";

export interface VerifiedCandidate {
  result: SearchResult;
  checks: ConditionCheck[];
  tier: number;
  aiOrder: number;
}

export function toAiCandidates(candidates: SearchCandidate[]): AiCandidate[] {
  // 응답의 식별자는 파일별 node ID 충돌을 막는 요청 내 식별자다. 링크는 인덱스에서만 복원한다.
  return candidates.map(({ screen, matchedConditions, unmatchedConditions }, i) => ({
    screenId: `candidate-${i + 1}`, section: screen.section, name: screen.name,
    fileName: screen.fileName, pageName: screen.pageName, structure: screen.structure, cohortLabels: screen.cohortLabels,
    texts: screen.texts, components: screen.components, tokens: screen.tokens,
    preliminaryMatches: matchedConditions, preliminaryMisses: unmatchedConditions,
    evidence: getEvidence(screen), frame: { width: screen.width, height: screen.height },
    elements: screen.elements,
  }));
}

export function verifyJudgements(candidates: SearchCandidate[], judgements: AiJudgement[], conditions: SearchCondition[], team: TeamPage): VerifiedCandidate[] {
  const seen = new Set<string>();
  const verified: VerifiedCandidate[] = [];
  const nearbyOnly = judgements.length === 0;
  const assessed: AiJudgement[] = nearbyOnly ? candidates.map((candidate, i) => {
    const atoms = getEvidence(candidate.screen);
    return { screenId: `candidate-${i + 1}`, verdict: "부분 일치", relevance: "low", recommendationOnly: true,
      reasons: ["AI가 판정 결과를 반환하지 않아 인덱스의 관련 단서로 추천"],
      checks: conditions.map(c => {
        // 단어 일치는 AI의 의미·범위 판정을 대신하지 않는다. 실제 단서만 연결하고
        // 미확인 상태를 유지해 근거가 있는데도 '인덱스 근거 없음'으로 보이지 않게 한다.
        const refs = c.requirement === "exclude" ? [] : atoms.filter(a => a.strength === "direct" && a.source !== "팀" && conditionMatches(a, c)).slice(0, 3).map(a => a.ref);
        return { conditionId: c.id!, status: "확인 불가", evidenceRefs: refs, scope: "unknown",
          explanation: refs.length ? "관련 문구는 있지만 AI가 조건별 판정을 반환하지 않아 충족 여부는 미확인" : "AI가 조건별 판정을 반환하지 않아 충족 여부는 미확인" };
      }) };
  }) : judgements;
  for (const [aiOrder, judgement] of assessed.entries()) {
    if (seen.has(judgement.screenId)) continue;
    const match = /^candidate-(\d+)$/.exec(judgement.screenId);
    const candidate = match ? candidates[Number(match[1]) - 1] : undefined;
    if (!candidate || candidate.screen.teamPage !== team) continue;
    seen.add(judgement.screenId);
    if (judgement.relevance === "irrelevant" || !judgement.checks?.length) continue;
    const atoms = getEvidence(candidate.screen);
    const byRef = new Map(atoms.map((atom) => [atom.ref, atom]));
    const provided = judgement.providedEvidenceRefs ? new Set(judgement.providedEvidenceRefs) : undefined;
    const checks = conditions.map((condition) => validateCheck(condition, judgement.checks ?? [], byRef, conditions, provided));
    const variants = atoms.filter((atom) => atom.source === "variant").map((atom) => atom.value);
    const mixedStates = variants.some((value) => /(?:state|status)\s*=\s*empty\b/i.test(value))
      && variants.some((value) => /(?:state|status)\s*=\s*(?:filled|populated|nonempty)\b/i.test(value));
    if (mixedStates) {
      for (const condition of conditions.filter((item) => item.kind === "state" && item.scope === "screen")) {
        const check = checks.find((item) => item.conditionId === condition.id)!;
        if (check.status === "확인됨") {
          check.status = "추정";
          check.explanation = "빈 상태와 채워진 상태가 함께 있어 화면 전체의 상태 범위를 확인하지 못함";
        }
      }
    }
    // 같은 컴포넌트/속성의 관계를 연결된 두 조건의 실제 증거에서도 재검사한다.
    for (const condition of conditions.filter((item) => item.relatedTo)) {
      const check = checks.find((item) => item.conditionId === condition.id)!;
      const parent = checks.find((item) => item.conditionId === condition.relatedTo);
      if (check.status !== "확인됨") continue;
      const owners = new Set(parent?.evidenceRefs.map((ref) => byRef.get(ref)?.owner).filter(Boolean));
      if (!check.evidenceRefs.some((ref) => { const owner = byRef.get(ref)?.owner; return owner && owners.has(owner); })) {
        check.status = "확인 불가";
        check.explanation = "같은 컴포넌트 사용 정보에 속한 속성인지 확인하지 못함";
      }
    }
    const positive = conditions.filter((condition) => condition.requirement !== "exclude");
    const required = conditions.filter((condition) => (condition.requirement ?? "must") === "must");
    const excluded = conditions.filter((condition) => condition.requirement === "exclude" && condition.sourceVerified !== false);
    const get = (condition: SearchCondition) => checks.find((check) => check.conditionId === condition.id)!;
    if (excluded.some((condition) => get(condition).status === "확인됨")) continue;
    if (excluded.some(condition => atoms.some(atom => atom.strength === "direct" && conditionMatches(atom, condition)))) continue;
    const relatedAtoms = atoms.filter(atom => atom.strength === "direct" && atom.source !== "팀" && positive.some(condition => condition.kind !== "service" && conditionMatches(atom, condition)));
    const recommendation = judgement.recommendationOnly || judgement.relevance === "low";
    const validRefs = judgement.checks.every(check => check.evidenceRefs.every(ref => byRef.has(ref)));
    const supporting = positive.filter((condition) => condition.kind !== "service")
      .some((condition) => {
        const check = get(condition);
        return (check.status === "확인됨" || check.status === "추정")
          && check.evidenceRefs.some((ref) => byRef.get(ref)?.strength === "direct");
      });
    // 팀 소속이나 이름만 보고 만들어낸 무관한 결과로 개수를 채우지 않는다.
    if (!supporting && !(recommendation && validRefs && relatedAtoms.length)) continue;
    const allRequired = required.every((condition) => get(condition).status === "확인됨");
    const clearExclusions = excluded.every((condition) => get(condition).status === "불충족");
    const contradicted = required.some((condition) => get(condition).status === "불충족");
    const exact = !judgement.evidenceIncomplete && !recommendation && !conditions.some(c => c.sourceVerified === false) && allRequired && clearExclusions && positive.some((condition) => condition.kind !== "service" && get(condition).status === "확인됨");
    const tier = exact ? 0 : recommendation ? 3 : contradicted ? 2 : judgement.relevance === "high" ? 1 : 2;
    const reasons = positive.map((condition) => {
      const check = get(condition);
      const quotes = check.evidenceRefs.map((ref) => { const atom = byRef.get(ref)!; return `${atom.source} '${atom.value}'`; }).join(", ");
      return `[${check.status}] ${condition.label}: ${quotes || "AI가 인용한 근거 없음"}${check.explanation ? ` — AI 해석/검증 안내: ${check.explanation}` : ""}`;
    });
    const conditionClues = positive.flatMap(c => relatedAtoms.find(a => conditionMatches(a, c)) ?? []);
    const diverseClues = [...new Map([...conditionClues, ...relatedAtoms].map(a => [a.ref, a])).values()];
    if (recommendation) reasons.unshift(`유사 화면 추천: 정답으로 확인한 화면은 아닙니다.${diverseClues.length ? ` 실제 관련 단서: ${diverseClues.slice(0, 3).map(atom => `${atom.source} '${atom.value}'`).join(", ")}` : ""}`);
    if (nearbyOnly) reasons.push("AI가 판정 결과를 반환하지 않아 검색어와 관련된 문구가 있는 화면을 추천했습니다. 조건 불충족 판정은 아닙니다.");
    else if (judgement.recommendationOnly) reasons.push("AI의 부정 판정 또는 정답 미확인으로 인해 부분 일치 추천으로만 표시합니다.");
    if (judgement.evidenceIncomplete) reasons.unshift("요청 크기를 제한하기 위해 일부 화면 정보는 AI에 전달하지 않았습니다. 전체 조건을 확정하지 않고 부분 일치로 표시합니다.");
    const unmetConditions = conditions.filter((condition) => condition.requirement === "exclude"
      ? get(condition).status !== "불충족" : (condition.requirement ?? "must") === "must" && get(condition).status !== "확인됨")
      .map((condition) => `${condition.label}: ${get(condition).status} — ${get(condition).explanation}`);
    if (judgement.evidenceIncomplete) unmetConditions.push("일부 화면 정보 미전달: 생략된 정보의 상태·제외조건은 확인하지 못했습니다.");
    verified.push({ result: { screen: candidate.screen, verdict: exact ? "정답 후보" : "부분 일치", reasons, ...(exact ? {} : { unmetConditions }) }, checks, tier, aiOrder });
  }
  // 등급 사이의 안전장치만 적용한다. 같은 등급 안의 의미적 관련도 순서는 AI 판단을 유지한다.
  const sorted = verified.sort((a, b) => a.tier - b.tier || a.aiOrder - b.aiOrder);
  return nearbyOnly ? sorted.slice(0, 3) : sorted;
}

function validateCheck(condition: SearchCondition, raw: ConditionCheck[], byRef: Map<string, EvidenceAtom>, conditions: SearchCondition[], provided?: Set<string>): ConditionCheck {
  const found = raw.filter((check) => check.conditionId === condition.id);
  const unknown = (explanation: string): ConditionCheck => ({ conditionId: condition.id!, status: "확인 불가", evidenceRefs: [], explanation });
  if (found.length !== 1) return unknown("조건별 판정이 누락되었거나 중복됨");
  const original = found[0];
  if (provided && original.evidenceRefs.some(ref => !provided.has(ref))) return unknown("AI에 전달하지 않은 근거를 인용함");
  if (original.evidenceRefs.some((ref) => !byRef.has(ref))) return unknown("AI가 제시한 근거가 인덱스에 없음");
  const atoms = original.evidenceRefs.map((ref) => byRef.get(ref)!);
  const check = { ...original };
  if (condition.sourceVerified === false) return { ...check, status: "추정", explanation: "검색어 원문과의 연결을 확인하지 못한 AI 해석입니다. 조건 충족을 확정하지 않습니다." };
  if (check.status === "확인 불가") return check;
  if (!atoms.length) return unknown("검증 가능한 직접 근거가 없음");
  if (check.status === "추정") return check;
  const direct = atoms.filter((atom) => atom.strength === "direct");
  if (!direct.length) return { ...check, status: "추정", explanation: "이름·구역만 일치하며 실제 화면의 역할·상태는 확인되지 않음" };
  if (check.status === "불충족") return check; // 반대 근거도 원문 존재 여부를 검사한다. 부재만으로 불충족을 만들지 않는다.
  if (condition.kind === "state" && condition.scope === "screen" && (check.scope !== "screen" || direct.every((atom) => atom.owner?.startsWith("elements/")))) {
    return { ...check, status: "추정", explanation: "일부 요소의 상태와 화면 전체의 상태를 구분할 근거가 부족함" };
  }
  // 컴포넌트·속성·상태·서비스 조건은 실제 해당 값이 있어야 확인됨이다.
  if (["screen", "component", "property", "state", "service", "platform", "token"].includes(condition.kind ?? "")
    && !direct.some((atom) => conditionMatches(atom, condition))) {
    return { ...check, status: "추정", explanation: "인용한 데이터는 존재하지만 요청한 조건을 직접 확인하지 못함" };
  }
  if (condition.relatedTo && !conditions.some((other) => other.id === condition.relatedTo)) return unknown("연결할 조건이 없음");
  return check;
}
