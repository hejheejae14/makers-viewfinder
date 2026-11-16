import type { ReactNode } from "react";
import styles from "./Tag.module.css";

// MDS v2 Tag. 항목의 상태를 표시하는 라벨이라 누를 수 없다.
// Figma에서 값을 확인한 모양(small · rect · subtle, default·primary)만 만들었다. 다른 변형은 필요할 때 Figma에서 읽어 추가한다.
export interface TagProps {
  /** default: 회색 / primary: 브랜드색(주황) (List/Default/Complicate의 Tag가 primary) */
  variant?: "default" | "primary";
  /** small: 12px / medium: 14px (Figma Tag size) */
  size?: "small" | "medium";
  children: ReactNode;
}

export function Tag({
  variant = "default",
  size = "small",
  children,
}: TagProps) {
  return (
    <span className={`${styles.tag} ${styles[variant]} ${styles[size]}`}>
      {children}
    </span>
  );
}
