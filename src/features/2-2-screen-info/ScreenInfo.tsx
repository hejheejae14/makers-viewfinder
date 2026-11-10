"use client";

import { Button, Callout } from "@/components/mds";
import type { SearchResult } from "@/lib/types";
import styles from "./ScreenInfo.module.css";

// 2-2. 화면 정보: 검색 결과 하나의 화면 이름, 팀·구역, AI 설명, 찾은 근거, 원본 링크를 보여 준다.
// 부분 일치이면 맞지 않은 조건도 함께 보여 준다. (AGENTS.md 검색 결과 판정 규칙)
// 썸네일: 화면 이미지 주소(thumbnailUrl)가 오면 보여 주고, 없으면 자리 표시 문구(thumbnailNote)를 보여 준다.
// 이미지는 저장하지 않고 Figma에서 그때그때 받은 임시 주소만 받는다. (1-1 screen-image)

export interface ScreenInfoProps {
  result: SearchResult;
  thumbnailUrl?: string;
  /** 이미지가 없을 때 칸 안에 보여 줄 문구. 기본은 "화면 썸네일" */
  thumbnailNote?: string;
}

export function ScreenInfo({ result, thumbnailUrl, thumbnailNote }: ScreenInfoProps) {
  const { screen, reasons, unmetConditions, summary } = result;
  const hasUnmet = Boolean(unmetConditions?.length);

  return (
    <section className={styles.overview} aria-label="화면 정보">
      <div className={styles.thumbnail}>
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Figma가 주는 임시 이미지 주소라 next/image를 쓰지 않는다
          <img className={styles.thumbnailImage} src={thumbnailUrl} alt={`${screen.name} 화면`} />
        ) : (
          (thumbnailNote ?? "화면 썸네일")
        )}
      </div>

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
