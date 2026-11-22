"use client";

import { useState } from "react";
import { Button, TextButton } from "@/components/mds";
import type { IndexedScreen, SearchResult } from "@/lib/types";
import { ImageViewer } from "./ImageViewer";
import styles from "./ResultDetail.module.css";

// 선택한 검색 결과의 상세. 박스 없이 이름과 값을 한 줄씩 보여 준다. (2-2 화면 정보, 2-3 다른 버전, 2-4 MDS를 한 흐름으로 보여 주는 임시 배치)
// 값은 기존 기능(ScreenInfo, OtherVersions, MdsUsage)이 보여 주던 것과 같고, 모양만 다르다.
interface ResultDetailProps {
  result: SearchResult;
  thumbnailUrl?: string;
  /** 이미지 주소를 받아 오는 중인지. true면 칸 안에 로딩 표시를 보여 준다. */
  thumbnailLoading?: boolean;
  /** 이미지가 없을 때(받아 오지 못했을 때 등) 칸 안에 보여 줄 문구 */
  thumbnailNote?: string;
}

// 이 폭 이하의 프레임을 모바일 화면으로 본다. (플그 인덱스: W320, W375, W768은 Mobile, W769 이상은 Desktop)
const MOBILE_MAX_WIDTH = 768;

const unique = <T,>(items: T[], key: (item: T) => string) =>
  items.filter(
    (item, index) =>
      items.findIndex((other) => key(other) === key(item)) === index,
  );

function otherVersionLink(screen: IndexedScreen): string | undefined {
  if (screen.fileKey === "MOCK_FILE_KEY") return;
  try {
    const url = new URL(screen.figmaUrl);
    if (
      url.protocol === "https:" &&
      (url.hostname === "www.figma.com" || url.hostname === "figma.com")
    )
      return url.href;
  } catch {
    /* 확인할 수 없는 링크는 열지 않는다. */
  }
}

export function ResultDetail({
  result,
  thumbnailUrl,
  thumbnailLoading,
  thumbnailNote,
}: ResultDetailProps) {
  const { screen, reasons, unmetConditions, summary, otherVersions } = result;
  const [viewing, setViewing] = useState(false);
  // 모바일 화면인지. 이 경우 틀 폭을 실제 폰 비율로 좁힌다.
  // 세로로 길다고 모바일은 아니므로, 화면 프레임 폭(MDS 반응형 기준 768px 이하)으로 판단한다.
  // 인덱스에 폭이 없으면 이미지 폭(Figma 이미지는 프레임과 같은 폭)으로 대신한다.
  const [imageWidth, setImageWidth] = useState(0);
  // 이미지 주소를 받아도 그림이 다 불러와질 때까지는 로딩 표시를 유지한다.
  const [loadedUrl, setLoadedUrl] = useState<string>();
  const loading =
    Boolean(thumbnailLoading) || (!!thumbnailUrl && loadedUrl !== thumbnailUrl);
  const frameWidth = screen.width ?? imageWidth;
  const portrait = frameWidth > 0 && frameWidth <= MOBILE_MAX_WIDTH;

  const components = unique(
    screen.components.filter((item) => item.isMds),
    (item) =>
      [item.name, item.variant, item.mdsVersion, item.library].join("|"),
  );
  // 같은 이름의 컴포넌트는 하나로 묶고, 변형 값은 따로 모은다.
  const groups = [
    ...components
      .reduce((map, item) => {
        const key = `${item.name}|${item.mdsVersion ?? ""}`;
        const group = map.get(key) ?? {
          name: item.name,
          version: item.mdsVersion,
          variants: [] as string[],
        };
        if (item.variant) group.variants.push(item.variant);
        map.set(key, group);
        return map;
      }, new Map<string, { name: string; version?: string; variants: string[] }>())
      .values(),
  ];
  const tokens = [
    ...new Set(screen.tokens.map((token) => token.trim()).filter(Boolean)),
  ];
  const versions = unique(
    (otherVersions ?? []).filter(
      (item) => !(item.fileKey === screen.fileKey && item.id === screen.id),
    ),
    (item) => `${item.fileKey}:${item.id}`,
  );

  return (
    <section className={styles.detail} aria-label="화면 정보">
      {thumbnailUrl || thumbnailLoading ? (
        <>
          <div
            className={`${styles.thumbnail} ${portrait ? styles.portrait : ""} ${loading ? styles.loading : ""}`}
            aria-busy={loading}
          >
            {loading && (
              <div
                className={styles.skeleton}
                role="status"
                aria-label="화면 이미지를 불러오는 중"
              />
            )}
            {thumbnailUrl && (
              <button
                type="button"
                className={styles.zoomable}
                onClick={() => setViewing(true)}
                aria-label={`${screen.name} 화면 크게 보기`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Figma가 주는 임시 이미지 주소라 next/image를 쓰지 않는다 */}
                <img
                  className={`${styles.thumbnailImage} ${loading ? styles.hidden : ""}`}
                  src={thumbnailUrl}
                  alt={`${screen.name} 화면`}
                  onLoad={(event) => {
                    setImageWidth(event.currentTarget.naturalWidth);
                    setLoadedUrl(thumbnailUrl);
                  }}
                />
              </button>
            )}
          </div>
          {thumbnailUrl && (
            <ImageViewer
              open={viewing}
              onClose={() => setViewing(false)}
              src={thumbnailUrl}
              alt={`${screen.name} 화면`}
              elements={screen.elements}
              frame={{ width: screen.width, height: screen.height }}
            />
          )}
        </>
      ) : (
        <div className={styles.thumbnail}>{thumbnailNote ?? "화면 썸네일"}</div>
      )}

      <div className={styles.info}>
        <div className={styles.titleRow}>
          <h2 className={styles.name}>{screen.name}</h2>
          <Button
            size="small"
            variant="secondary"
            suffixIcon={
              // eslint-disable-next-line @next/next/no-img-element -- MDS 아이콘 SVG(icon_arrowUpRight)를 그대로 쓴다
              <img
                src="/mds-icons/arrow-up-right.svg"
                alt=""
                width={16}
                height={16}
              />
            }
            onClick={() =>
              window.open(screen.figmaUrl, "_blank", "noopener,noreferrer")
            }
          >
            Figma에서 열기
          </Button>
        </div>
        {summary && <p className={styles.text}>{summary}</p>}

        <dl className={styles.facts}>
          <dt>팀</dt>
          <dd>{screen.teamPage}</dd>
          {screen.fileName && <><dt>원본 파일</dt><dd>{screen.fileName}</dd></>}
          {screen.pageName && <><dt>페이지</dt><dd>{screen.pageName}</dd></>}
          {!!screen.cohortLabels?.length && <><dt>이름에 적힌 기수</dt><dd>{screen.cohortLabels.join(", ")} (화면 제작·완료 기수는 확인되지 않음)</dd></>}
          {screen.designStatus && <><dt>작업 상태</dt><dd>확정·완료 여부 미확인</dd></>}
          {screen.originalTeam && screen.originalTeam !== screen.teamPage && <><dt>기존 출처 팀</dt><dd>{screen.originalTeam}</dd></>}
          <dt>구역</dt>
          <dd>{screen.section ?? "-"}</dd>
          <dt>찾은 근거</dt>
          <dd>
            <ul className={styles.lines}>
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </dd>
          {unmetConditions?.length ? (
            <>
              <dt>맞지 않은 조건</dt>
              <dd>
                <ul className={styles.lines}>
                  {unmetConditions.map((condition) => (
                    <li key={condition}>{condition}</li>
                  ))}
                </ul>
              </dd>
            </>
          ) : null}
          {versions.length > 0 && (
            <>
              <dt>다른 버전</dt>
              <dd>
                <ul className={styles.lines}>
                  {versions.map((version) => {
                    const href = otherVersionLink(version);
                    return (
                      <li key={`${version.fileKey}:${version.id}`}>
                        {version.name}
                        <span className={styles.sub}>
                          {" "}
                          · {version.teamPage}
                        </span>{" "}
                        {href && (
                          <TextButton href={href} suffix={false}>
                            원본 열기
                          </TextButton>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </dd>
            </>
          )}
        </dl>

        <section className={styles.section}>
          <h3 className={styles.heading}>
            MDS 컴포넌트 <span className={styles.count}>{groups.length}</span>
          </h3>
          {groups.length ? (
            <div className={styles.tableBox}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>MDS 버전</th>
                    <th>컴포넌트 이름</th>
                    <th>상세 설정</th>
                  </tr>
                </thead>
                <tbody>
                  {(["v2", "v1", undefined] as const)
                    .map((version) => ({
                      version,
                      items: groups.filter(
                        (group) => group.version === version,
                      ),
                    }))
                    .filter((part) => part.items.length)
                    .flatMap((part, partIndex, parts) =>
                      part.items.map((group, index) => (
                        <tr key={`${group.name}|${group.version}`}>
                          {index === 0 && (
                            // 같은 버전은 칸을 합쳐서 맨 위에 한 번만 쓴다
                            <td
                              rowSpan={part.items.length}
                              className={`${styles.cellVersion} ${partIndex === parts.length - 1 ? styles.cellVersionLast : ""}`}
                            >
                              {part.version ?? "버전 없음"}
                            </td>
                          )}
                          <td className={styles.cellName}>{group.name}</td>
                          <td className={styles.cellDetail}>
                            {group.variants.length ? (
                              <ul className={styles.cellLines}>
                                {group.variants.map((variant) => (
                                  <li key={variant}>{variant}</li>
                                ))}
                              </ul>
                            ) : (
                              <span
                                className={`${styles.sub} ${styles.cellEmpty}`}
                              >
                                -
                              </span>
                            )}
                          </td>
                        </tr>
                      )),
                    )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.sub}>
              {screen.elements?.length === 0
                ? "이 화면에는 MDS 컴포넌트가 없는 것으로 기록되어 있어요."
                : "기록된 정보가 없어요."}
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>
            MDS 토큰 <span className={styles.count}>{tokens.length}</span>
          </h3>
          {tokens.length ? (
            <ul className={`${styles.rows} ${styles.tokenRows}`}>
              {tokens.map((token) => (
                <li key={token} className={styles.plain}>
                  <span className={styles.rowName}>{token}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.sub}>기록된 정보가 없어요.</p>
          )}
        </section>
      </div>
    </section>
  );
}
