import type { IndexedScreen } from "../../lib/types";
import type { EvidenceAtom, SearchCondition } from "./search-model";

export function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR")
    .replace(/[_/\\|()[\]{}.,!?@'":;+*-]+/g, " ").replace(/\s+/g, " ").trim();
}

/** 역방향 포함 비교 금지. 영문은 단어 경계를 지켜 Card와 Discard를 구분한다. */
export function includesTerm(text: string, term: string) {
  const normalizedText = normalize(text);
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  if (/^[a-z0-9 ]+$/.test(normalizedTerm)) {
    const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(normalizedText);
  }
  return normalizedText.includes(normalizedTerm);
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
  if (condition.kind === "cohort") return atom.source === "기수 표기" && condition.aliases.some((a) => normalize(atom.value).replace(/\s/g, "") === normalize(a).replace(/\s/g, ""));
  if (atom.source === "기수 표기") return false;
  // 서비스/팀 근거를 다른 종류의 조건 충족에 사용하지 않는다.
  if (atom.source === "팀" && condition.kind !== "service") return false;
  if (condition.kind === "service" && atom.source !== "팀" && atom.source !== "화면 속 텍스트") return false;
  if (condition.kind === "component" && atom.source !== "컴포넌트" && atom.strength !== "hint") return false;
  if (condition.kind === "property" && atom.source !== "variant" && atom.strength !== "hint") return false;
  return condition.aliases.some((alias) => includesTerm(atom.value, alias));
}
