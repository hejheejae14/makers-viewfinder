import type { ReactNode } from "react";
import styles from "./TopNavigation.module.css";

// MDS v2 TopNavigation (Web, left, md). 왼쪽 TitleSlot에는 로고·탭을, 오른쪽 RightSlot에는 부가 요소를 넣는다.
export interface TopNavigationProps {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function TopNavigation({ title, right, className }: TopNavigationProps) {
  return (
    <header className={[styles.topNavigation, className].filter(Boolean).join(" ")}>
      <div className={styles.titleSlot}>{title}</div>
      {right && <div className={styles.rightSlot}>{right}</div>}
    </header>
  );
}
