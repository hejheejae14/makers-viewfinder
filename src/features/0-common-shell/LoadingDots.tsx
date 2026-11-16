import styles from "./LoadingDots.module.css";

// 로딩 중임을 알려 주는 점 세 개. 왼쪽부터 차례로 위로 튀어 오르는 파도 모양이다.
// 색은 글자색(currentColor)을 따라가서 버튼이 비활성일 때의 색도 그대로 따른다.
// 화면 읽기 프로그램에는 점이 읽히지 않으므로, 쓰는 쪽에서 aria-label로 "찾는 중" 같은 뜻을 붙인다.
interface LoadingDotsProps {
  /** 점이 없을 때 보이던 글자. 그 글자만큼 자리를 잡아 두어, 글자가 점으로 바뀔 때 버튼 폭이 줄지 않는다. */
  reserve?: string;
}

export function LoadingDots({ reserve }: LoadingDotsProps) {
  const dots = (
    <span className={styles.dots} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
  if (!reserve) return dots;
  return (
    <span className={styles.reserve}>
      <span className={styles.reserved} aria-hidden="true">
        {reserve}
      </span>
      <span className={styles.center}>{dots}</span>
    </span>
  );
}
