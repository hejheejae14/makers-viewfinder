import { Callout, TextButton } from "@/components/mds";
import type { IndexedScreen } from "@/lib/types";
import styles from "./OtherVersions.module.css";

export interface OtherVersionsProps {
  screen: IndexedScreen;
  otherVersions?: IndexedScreen[];
}

function originalLink(screen: IndexedScreen): string | undefined {
  if (screen.fileKey === "MOCK_FILE_KEY") return;
  try {
    const url = new URL(screen.figmaUrl);
    if (url.protocol === "https:" && (url.hostname === "www.figma.com" || url.hostname === "figma.com")) return url.href;
  } catch { /* 확인할 수 없는 링크는 열지 않는다. */ }
}

export function OtherVersions({ screen, otherVersions }: OtherVersionsProps) {
  const versions = (otherVersions ?? []).filter((item, index, items) =>
    !(item.fileKey === screen.fileKey && item.id === screen.id) &&
    items.findIndex((candidate) => candidate.fileKey === item.fileKey && candidate.id === item.id) === index,
  );

  return (
    <section className={styles.panel} aria-label="다른 버전 함께 보기">
      <h2 className={styles.heading}>다른 버전 함께 보기</h2>
      <p className={styles.description}>현재 화면: {screen.name} · {screen.teamPage}</p>
      {versions.length === 0 ? (
        <Callout>전달받은 다른 버전 정보가 없어요.</Callout>
      ) : (
        <ul className={styles.list}>
          {versions.map((version) => {
            const href = originalLink(version);
            const mock = version.fileKey === "MOCK_FILE_KEY";
            return (
              <li className={styles.item} key={`${version.fileKey}:${version.id}`}>
                <h3 className={styles.name}>{version.name}</h3>
                <p className={styles.description}>팀 페이지 · {version.teamPage}</p>
                {href ? <TextButton href={href}>Figma에서 원본 열기</TextButton> : (
                  <>
                    <p className={styles.description}>{mock ? "가짜 데이터 · 실제 Figma 원본이 아니에요." : "원본 링크를 확인할 수 없어요."}</p>
                    <TextButton disabled>원본 열기 불가</TextButton>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
