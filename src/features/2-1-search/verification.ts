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
  for (const [aiOrder, judgement] of judgements.entries()) {
    if (seen.has(judgement.screenId)) continue;
    const match = /^candidate-(\d+)$/.exec(judgement.screenId);
    const candidate = match ? candidates[Number(match[1]) - 1] : undefined;
    if (!candidate || candidate.screen.teamPage !== team) continue;
    seen.add(judgement.screenId);
    if (judgement.relevance === "low" || judgement.relevance === "irrelevant" || !judgement.checks?.length) continue;
    const atoms = getEvidence(candidate.screen);
    const byRef = new Map(atoms.map((atom) => [atom.ref, atom]));
    const checks = conditions.map((condition) => validateCheck(condition, judgement.checks ?? [], byRef, conditions));
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
    const excluded = conditions.filter((condition) => condition.requirement === "exclude");
    const get = (condition: SearchCondition) => checks.find((check) => check.conditionId === condition.id)!;
    if (excluded.some((condition) => get(condition).status === "확인됨")) continue;
    const supporting = positive.filter((condition) => condition.kind !== "service")
      .some((condition) => {
        const check = get(condition);
        return (check.status === "확인됨" || check.status === "추정")
          && check.evidenceRefs.some((ref) => byRef.get(ref)?.strength === "direct");
      });
    // 팀 소속이나 이름만 보고 만들어낸 무관한 결과로 개수를 채우지 않는다.
    if (!supporting) continue;
    const allRequired = required.every((condition) => get(condition).status === "확인됨");
    const clearExclusions = excluded.every((condition) => get(condition).status === "불충족");
    const contradicted = required.some((condition) => get(condition).status === "불충족");
    const exact = allRequired && clearExclusions && positive.some((condition) => condition.kind !== "service" && get(condition).status === "확인됨");
    const tier = exact ? 0 : contradicted ? 2 : judgement.relevance === "high" ? 1 : 2;
    const reasons = positive.map((condition) => {
      const check = get(condition);
      const quotes = check.evidenceRefs.map((ref) => { const atom = byRef.get(ref)!; return `${atom.source} '${atom.value}'`; }).join(", ");
      return `[${check.status}] ${condition.label}: ${quotes || "인덱스 근거 없음"}${check.explanation ? ` — AI 해석/검증 안내: ${check.explanation}` : ""}`;
    });
    const unmetConditions = conditions.filter((condition) => condition.requirement === "exclude"
      ? get(condition).status !== "불충족" : (condition.requirement ?? "must") === "must" && get(condition).status !== "확인됨")
      .map((condition) => `${condition.label}: ${get(condition).status} — ${get(condition).explanation}`);
    verified.push({ result: { screen: candidate.screen, verdict: exact ? "정답 후보" : "부분 일치", reasons, ...(exact ? {} : { unmetConditions }) }, checks, tier, aiOrder });
  }
  // 등급 사이의 안전장치만 적용한다. 같은 등급 안의 의미적 관련도 순서는 AI 판단을 유지한다.
  return verified.sort((a, b) => a.tier - b.tier || a.aiOrder - b.aiOrder);
}

function validateCheck(condition: SearchCondition, raw: ConditionCheck[], byRef: Map<string, EvidenceAtom>, conditions: SearchCondition[]): ConditionCheck {
  const found = raw.filter((check) => check.conditionId === condition.id);
  const unknown = (explanation: string): ConditionCheck => ({ conditionId: condition.id!, status: "확인 불가", evidenceRefs: [], explanation });
  if (found.length !== 1) return unknown("조건별 판정이 누락되었거나 중복됨");
  const original = found[0];
  if (original.evidenceRefs.some((ref) => !byRef.has(ref))) return unknown("AI가 제시한 근거가 인덱스에 없음");
  const atoms = original.evidenceRefs.map((ref) => byRef.get(ref)!);
  const check = { ...original };
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
