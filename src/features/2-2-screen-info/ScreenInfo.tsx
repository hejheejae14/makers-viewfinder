"use client";

import { Button, Callout } from "@/components/mds";
import type { SearchResult } from "@/lib/types";
import styles from "./ScreenInfo.module.css";

// 2-2. 화면 정보: 검색 결과 하나의 화면 이름, 팀·구역, AI 설명, 찾은 근거, 원본 링크를 보여 준다.
// 부분 일치이면 맞지 않은 조건도 함께 보여 준다. (AGENTS.md 검색 결과 판정 규칙)
// 썸네일은 아직 자리만 있다. 실제 이미지 연결은 다음 작업에서 한다.

export interface ScreenInfoProps {
  result: SearchResult;
}

export function ScreenInfo({ result }: ScreenInfoProps) {
  const { screen, reasons, unmetConditions, summary } = result;
  const hasUnmet = Boolean(unmetConditions?.length);

  return (
    <section className={styles.overview} aria-label="화면 정보">
      <div className={styles.thumbnail}>화면 썸네일</div>

      <div className={styles.info}>
        <h2 className={styles.name}>{screen.name}</h2>

        <dl className={styles.meta}>
          <dt>팀 페이지</dt>
          <dd>{screen.teamPage}</dd>
          <dt>구역</dt>
          <dd>{screen.section ?? "-"}</dd>
        </dl>

        {summary && <p className={styles.summary}>{summary}</p>}

        <Callout tone="information">
          <div className={styles.evidence}>
            <div className={styles.evidenceGroup}>
              <p className={styles.evidenceTitle}>찾은 근거</p>
              <ul className={styles.evidenceList}>
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            {hasUnmet && (
              <div className={styles.evidenceGroup}>
                <p className={styles.evidenceTitle}>맞지 않은 조건</p>
                <ul className={styles.evidenceList}>
                  {unmetConditions?.map((condition) => (
                    <li key={condition}>{condition}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Callout>

        <Button variant="secondary" onClick={() => window.open(screen.figmaUrl, "_blank", "noopener,noreferrer")}>
          Figma에서 원본 열기
        </Button>
      </div>
    </section>
  );
}
