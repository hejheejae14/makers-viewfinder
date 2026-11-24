import type { IndexedScreen } from "../../lib/types";
import type { EvidenceAtom, SearchCondition } from "./search-model";

/** 띄어쓰기 비교용. 표시·전송·인용에 쓰는 원문은 바꾸지 않는다. */
export function normalizeSpacing(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

export function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR")
    .replace(/[_/\\|()[\]{}.,!?@'":;+*-]+/g, " ").replace(/\s+/g, " ").trim();
}

/** 모든 표현의 내부 공백 차이를 무시한다. 영문·숫자는 원문의 바깥 단어 경계를 지킨다. */
export function includesTerm(text: string, term: string) {
  const normalizedText = normalize(text);
  const compactText = normalizedText.replace(/\s/g, "");
  const compactTerm = normalize(term).replace(/\s/g, "");
  if (!compactTerm) return false;
  const ascii = /[a-z0-9]/;
  const checkStart = ascii.test(compactTerm[0]);
  const checkEnd = ascii.test(compactTerm[compactTerm.length - 1]);
  if (!checkStart && !checkEnd) return compactText.includes(compactTerm);

  // 공백을 지운 위치를 원문 위치에 연결한다. 텍스트 전체를 붙여서 비교하면
  // 'a Card'의 Card가 누락되거나 Discard를 Card로 찾는 문제가 생긴다.
  const positions: number[] = [];
  for (let i = 0; i < normalizedText.length; i++) if (!/\s/.test(normalizedText[i])) positions.push(i);
  for (let start = compactText.indexOf(compactTerm); start >= 0; start = compactText.indexOf(compactTerm, start + 1)) {
    const before = normalizedText[positions[start] - 1] ?? "";
    const after = normalizedText[positions[start + compactTerm.length - 1] + 1] ?? "";
    if ((!checkStart || !ascii.test(before)) && (!checkEnd || !ascii.test(after))) return true;
  }
  return false;
}

export function getEvidence(screen: IndexedScreen): EvidenceAtom[] {
  const atoms: EvidenceAtom[] = [];
  const add = (ref: string, source: EvidenceAtom["source"], value: string | undefined, strength: EvidenceAtom["strength"] = "direct", owner?: string) => {
    if (value?.trim()) atoms.push({ ref, source, value, strength, ...(owner ? { owner } : {}) });
  };
  add("team", "팀", screen.teamPage);
  add("section", "구역", screen.section, "hint");
  add("name", "화면 이름", screen.name, "hint");
  add("fileName", "출처", screen.fileName, "hint");
  add("pageName", "출처", screen.pageName, "hint");
  screen.cohortLabels?.forEach((label, i) => add(`cohorts/${i}`, "기수 표기", label, "hint"));
  screen.texts.forEach((text, i) => add(`texts/${i}`, "화면 속 텍스트", text));
  screen.components.forEach((component, i) => {
    const owner = `components/${i}`;
    add(`${owner}/name`, "컴포넌트", component.name, "direct", owner);
    add(`${owner}/variant`, "variant", component.variant, "direct", owner);
    add(`${owner}/library`, "컴포넌트", component.library, "direct", owner);
    if (component.isMds) add(`${owner}/mds`, "컴포넌트", `MDS ${component.mdsVersion ?? ""}`, "direct", owner);
  });
  screen.tokens.forEach((token, i) => add(`tokens/${i}`, "토큰", token));
  screen.elements?.forEach((element, i) => {
    const owner = `elements/${i}`;
    add(`${owner}/component`, "컴포넌트", element.component, "direct", owner);
    add(`${owner}/variant`, "variant", element.variant, "direct", owner);
    element.texts.forEach((text, j) => add(`${owner}/texts/${j}`, "화면 속 텍스트", text, "direct", owner));
    element.tokens.forEach((token, j) => add(`${owner}/tokens/${j}`, "토큰", token, "direct", owner));
  });
  return atoms;
}

export function conditionMatches(atom: EvidenceAtom, condition: SearchCondition) {
  if (condition.kind === "cohort") return atom.source === "기수 표기" && condition.aliases.some((a) => normalizeSpacing(normalize(atom.value)) === normalizeSpacing(normalize(a)));
  if (atom.source === "기수 표기") return false;
  // 서비스/팀 근거를 다른 종류의 조건 충족에 사용하지 않는다.
  if (atom.source === "팀" && condition.kind !== "service") return false;
  if (condition.kind === "service" && atom.source !== "팀" && atom.source !== "화면 속 텍스트") return false;
  if (condition.kind === "component" && atom.source !== "컴포넌트" && atom.strength !== "hint") return false;
  if (condition.kind === "property" && atom.source !== "variant" && atom.strength !== "hint") return false;
  return condition.aliases.some((alias) => {
    // 외부 홈페이지 링크는 앱 홈 역할의 근거가 아니다. 다른 '홈' 문구는 유지한다.
    const value = condition.kind === "screen" && normalizeSpacing(alias) === "홈" ? atom.value.replace(/홈\s*페\s*이\s*지/g, "") : atom.value;
    return includesTerm(value, alias);
  });
}
