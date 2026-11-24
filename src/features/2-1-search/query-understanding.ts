import type { QueryUnderstanding, SearchCondition } from "./search-model";
import { normalizeSpacing } from "./evidence";

/** 알려진 핵심 조건의 누락을 원문에서 복구하고 추적한다. */
export function guardUnderstanding(query: string, understanding: QueryUnderstanding): QueryUnderstanding {
  const warnings = [...(understanding.warnings ?? [])];
  const conditions = understanding.conditions.map((condition, i) => ({ ...condition, id: condition.id ?? `c${i + 1}` }));
  const entireScreen = /(?:화면\s*전체|전체\s*화면|주요\s*콘텐츠\s*전체|화면[이가]\s*비어)/.test(query);
  const anchors: { pattern: RegExp; label: string; kind: SearchCondition["kind"]; aliases: string[] }[] = [
    { pattern: /홈(?:\s*화면)?(?!페이지)|메인\s*화면|\bhome\b/i, label: "홈 화면", kind: "screen", aliases: ["홈", "home", "메인", "main"] },
    { pattern: /empty(?:\s*view)?|엠티(?:뷰)?|빈\s*상태|(?:콘텐츠|컨텐츠|게시물)[이가]*\s*없(?:을|는|어요|음)?/i, label: "콘텐츠가 없는 상태", kind: "state", aliases: ["empty", "빈 상태", "없어요", "없습니다", "결과없음"] },
    { pattern: /앱\s*서비스|SOPT\s*APP/i, label: "앱서비스", kind: "service", aliases: ["앱", "SOPT APP", "앱서비스"] },
  ];
  for (const anchor of anchors) {
    const match = anchor.pattern.exec(query);
    if (!match) continue;
    const following = query.slice(match.index + match[0].length, match.index + match[0].length + 18);
    const preceding = query.slice(Math.max(0, match.index - 10), match.index);
    const requirement = /^(?:은|는|을|를| 화면)?\s*(?:제외|말고|아닌)/.test(following)
      ? "exclude" : /가능하면|선호|있으면/.test(preceding + following) ? "should" : "must";
    const existing = conditions.find((condition) => condition.kind === anchor.kind && condition.sourceText && normalizeSpacing(condition.sourceText).includes(normalizeSpacing(match[0])));
    if (existing) {
      if (existing.requirement !== requirement) {
        existing.requirement = requirement;
        warnings.push(`원문 기준으로 조건 중요도 복구: ${anchor.label}`);
      }
      if (anchor.kind === "screen") {
        existing.aliases = [...new Set([...anchor.aliases, ...existing.aliases])].slice(0, 12);
      }
      if (anchor.kind === "state" && entireScreen) existing.scope = "screen";
      // '메인화면 Empty View'는 화면 안의 빈 상태 UI를 찾는 요청이다.
      // 화면 전체의 부재를 명시한 경우는 기존의 엄격한 범위를 유지한다.
      if (anchor.kind === "state" && !entireScreen && /empty\s*view|엠티뷰/i.test(match[0]) && existing.scope === "screen") {
        existing.scope = "region";
        warnings.push("Empty View는 화면 안의 빈 상태 영역으로 해석했어요. 화면 전체 Empty를 요청하려면 전체 범위를 명시해 주세요.");
      }
      // Empty가 영어로만 해석돼도 '아직 최신글이 없어요' 같은 한국어 단서를
      // 후보 선정과 입력 압축에서 놓치지 않는다. 원문에 명시된 빈 상태에만 적용한다.
      if (anchor.kind === "state") {
        const meaningful = existing.aliases.filter(alias => /empty|엠티|없|빈|비어/i.test(alias));
        existing.aliases = [...new Set([...anchor.aliases, ...meaningful])].slice(0, 12);
        if (!meaningful.length) warnings.push("빈 상태 조건이 일반 명사로 축약되어 상태 동의어를 복구함");
      }
      continue;
    }
    conditions.push({ id: `guard-${anchor.kind}`, label: anchor.label, kind: anchor.kind, requirement, aliases: anchor.aliases, sourceText: match[0],
      scope: anchor.kind === "state" && !entireScreen ? "region" : "screen" });
    warnings.push(`검색어 해석에서 빠진 명시 조건 복구: ${anchor.label}`);
  }
  for (const match of query.matchAll(/\d+\s*기/g)) {
    if (!conditions.some((c) => c.kind === "cohort" && c.aliases.some((a) => a.replace(/\s/g, "") === match[0].replace(/\s/g, "")))) {
      const following = query.slice(match.index + match[0].length);
      const preceding = query.slice(Math.max(0, match.index - 10), match.index);
      conditions.push({ id: `cohort-${match.index}`, kind: "cohort", label: `${match[0]} 표기`, aliases: [match[0]], sourceText: match[0],
        requirement: /^(?:는|를)?\s*(?:제외|말고)/.test(following) ? "exclude" : /가능하면|선호|있으면/.test(preceding) ? "should" : "must" });
      warnings.push(`명시한 기수 조건 복구: ${match[0]}`);
    }
  }
  // 기수가 명시되지 않으면 최신 기수를 임의 조건으로 만들지 않는다.
  if (!/\d+\s*기/.test(query) && conditions.some((c) => c.kind === "cohort")) throw new Error("검색어에 없는 기수 조건이 추가되었습니다.");
  const allIds = new Set(conditions.map((c) => c.id));
  if (allIds.size !== conditions.length) throw new Error("검색 조건 ID가 중복되었습니다. 다시 검색해 주세요.");
  if (conditions.some((condition) => condition.relatedTo && !allIds.has(condition.relatedTo))) {
    throw new Error("검색 조건 사이의 연결을 해석하지 못했어요. 검색어를 구체적으로 입력해 주세요.");
  }
  if (!conditions.some((condition) => condition.requirement !== "exclude")) {
    throw new Error("제외할 조건 외에 찾고 싶은 화면도 입력해 주세요.");
  }
  return { conditions, warnings };
}
