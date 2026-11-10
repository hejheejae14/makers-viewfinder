import { Callout } from "@/components/mds";
import type { IndexedScreen } from "@/lib/types";
import styles from "./MdsUsage.module.css";

export interface MdsUsageProps { screen: IndexedScreen }

export function MdsUsage({ screen }: MdsUsageProps) {
  const components = screen.components.filter((item) => item.isMds).filter((item, index, items) =>
    items.findIndex((other) => other.name === item.name && other.variant === item.variant &&
      other.mdsVersion === item.mdsVersion && other.library === item.library) === index,
  );
  const tokens = [...new Set(screen.tokens.map((token) => token.trim()).filter(Boolean))];

  return (
    <section className={styles.panel} aria-label="MDS 컴포넌트와 토큰">
      <h2 className={styles.heading}>MDS 컴포넌트·토큰</h2>
      <p className={styles.description}>{screen.name}에 기록된 정보예요.</p>
      <h3 className={styles.subheading}>컴포넌트 · {components.length}</h3>
      {components.length ? (
        <ul className={styles.list}>
          {components.map((item, index) => (
            <li className={styles.item} key={index}>
              <div className={styles.row}>
                <strong className={styles.name}>{item.name}</strong>
                <span className={styles.tag}>{item.mdsVersion ? `MDS ${item.mdsVersion}` : "버전 정보 없음"}</span>
              </div>
              <dl className={styles.meta}>
                <dt>변형</dt><dd>{item.variant || "정보 없음"}</dd>
                <dt>라이브러리</dt><dd>{item.library || "정보 없음"}</dd>
              </dl>
            </li>
          ))}
        </ul>
      ) : <Callout>{screen.elements?.length === 0 ? "이 화면에는 MDS 컴포넌트가 없는 것으로 기록되어 있어요." : "기록된 MDS 컴포넌트 정보가 없어요. 미사용 여부는 확인할 수 없어요."}</Callout>}
      <h3 className={styles.subheading}>토큰 · {tokens.length}</h3>
      {tokens.length ? (
        <ul className={styles.tokens}>{tokens.map((token) => <li className={styles.tag} key={token}>{token}</li>)}</ul>
      ) : <Callout>기록된 MDS 토큰 정보가 없어요.</Callout>}
    </section>
  );
}
