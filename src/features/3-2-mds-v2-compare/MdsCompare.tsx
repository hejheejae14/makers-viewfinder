"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, Callout, Select, TextButton } from "@/components/mds";
import type { IndexedScreen, SearchResult } from "@/lib/types";
import { getComparableComponentNames, getMdsV2Cases } from "./compare";
import { createGeminiMdsCompare, type MdsComparedCase } from "./gemini-compare";
import styles from "./MdsCompare.module.css";

interface MdsCompareProps {
  result: SearchResult;
  screens: readonly IndexedScreen[];
  apiKey: string;
  exampleCases?: readonly MdsComparedCase[];
}

type Comparison =
  | { status: "idle" | "loading" }
  | { status: "ready"; cases: MdsComparedCase[] }
  | { status: "error"; message: string };

const ALL_COMPONENTS = "";

export function MdsCompare(props: MdsCompareProps) {
  const { fileKey, id } = props.result.screen;
  return <ComparisonPanel key={JSON.stringify([fileKey, id])} {...props} />;
}

function ComparisonPanel({ result, screens, apiKey, exampleCases }: MdsCompareProps) {
  const headingId = useId();
  const request = useRef<AbortController | null>(null);
  const [component, setComponent] = useState(ALL_COMPONENTS);
  const [comparison, setComparison] = useState<Comparison>({ status: "idle" });
  const componentNames = getComparableComponentNames(result.screen);
  const focus = component || undefined;
  const isExample = exampleCases !== undefined;
  const isLoading = comparison.status === "loading";
  const exampleResults = exampleCases?.filter(
    (example) => !focus || example.usages.some(({ name }) => name === focus),
  );
  const cases = comparison.status === "ready" ? comparison.cases : exampleResults;

  useEffect(() => () => request.current?.abort(), []);

  function selectComponent(value: string) {
    request.current?.abort();
    setComponent(value);
    setComparison({ status: "idle" });
  }

  async function compare() {
    const candidates = getMdsV2Cases(result, screens, focus);
    if (candidates.length === 0) {
      setComparison({ status: "ready", cases: [] });
      return;
    }
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setComparison({ status: "loading" });
    try {
      const compareCases = createGeminiMdsCompare(apiKey);
      const ranked = await compareCases({ result, candidates, component: focus, signal: controller.signal });
      if (!controller.signal.aborted) setComparison({ status: "ready", cases: ranked });
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : "사용 사례를 비교하지 못했습니다.";
        setComparison({ status: "error", message });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>기준 화면</p>
          <h2 id={headingId}>{result.summary?.trim() || result.screen.name}</h2>
          <p className={styles.meta}>{[result.screen.teamPage, result.screen.section, result.screen.name].filter(Boolean).join(" / ")}</p>
        </div>
        {componentNames.length > 0 && (
          <ul className={styles.chips} aria-label="기준 화면의 MDS 컴포넌트">
            {componentNames.map((name) => <li key={name}>{name}</li>)}
          </ul>
        )}
      </div>

      <div className={styles.controls}>
        <Select
          className={styles.select}
          label="비교 기준"
          options={[
            { value: ALL_COMPONENTS, label: "화면 전체 맥락" },
            ...componentNames.map((name) => ({ value: name, label: name })),
          ]}
          value={component}
          onChange={selectComponent}
        />
        <Button disabled={isLoading || !apiKey.trim()} onClick={() => void compare()}>
          {isLoading ? "비교하는 중…" : "AI로 사용 사례 비교"}
        </Button>
      </div>
      {!apiKey.trim() && <p className={styles.meta}>AI 비교를 시작하려면 개인 Gemini API 키가 필요해요.</p>}
      {isLoading && <p className={styles.meta} role="status">비슷한 상황의 MDS v2 화면을 찾고 있어요.</p>}
      {comparison.status === "error" && <Callout tone="danger">{comparison.message}</Callout>}

      {cases !== undefined && (
        <section className={styles.results} aria-labelledby={`${headingId}-results`} aria-busy={isLoading}>
          <div className={styles.resultsHeader}>
            <h3 id={`${headingId}-results`}>{isExample && comparison.status !== "ready" ? "예시 비교 결과" : "비교 결과"}</h3>
            <span role="status">{cases.length}개 사례</span>
          </div>
          {cases.length > 0 ? (
            <ul className={styles.grid}>
              {cases.map((item) => <CaseCard key={item.id} item={item} isExample={isExample} />)}
            </ul>
          ) : (
            <Callout icon={false}>이 기준으로 비교할 MDS v2 사용 사례를 찾지 못했어요.</Callout>
          )}
        </section>
      )}
    </section>
  );
}

function CaseCard({ item, isExample }: { item: MdsComparedCase; isExample: boolean }) {
  const { screen, usages, reason } = item;
  const hasUnknownTokens = usages.some(({ tokens }) => tokens === null);
  return (
    <li className={styles.case}>
      <div className={styles.caseHeader}>
        <p className={styles.eyebrow}>{[screen.teamPage, screen.section].filter(Boolean).join(" · ")}</p>
        <span className={styles.version}>MDS v2</span>
      </div>
      <h4>{screen.name}</h4>
      <div className={styles.reason}>
        <p className={styles.reasonLabel}>비슷한 점</p>
        <p>{reason}</p>
      </div>

      <table className={styles.usages} aria-label={`${screen.name}의 MDS v2 사용 내역`}>
        <thead><tr><th scope="col">컴포넌트</th><th scope="col">Variant</th><th scope="col">토큰</th></tr></thead>
        <tbody>
          {usages.map(({ name, variant, tokens }) => (
            <tr key={JSON.stringify([name, variant])}>
              <th scope="row">{name}</th>
              <td>{variant || "기록 없음"}</td>
              <td>{tokens === null ? "기록 없음" : tokens.join(", ") || "수집된 토큰 없음"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasUnknownTokens && screen.tokens.length > 0 && (
        <p className={styles.meta}>화면 전체 토큰 (컴포넌트별 출처 미기록) · {screen.tokens.join(", ")}</p>
      )}
      {!isExample && <TextButton href={screen.figmaUrl}>Figma 원본 열기</TextButton>}
    </li>
  );
}
