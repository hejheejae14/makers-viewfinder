import type { ReactNode } from "react";
import styles from "./Callout.module.css";

// MDS v2 Callout. information은 안내, danger는 꼭 읽어야 하는 경고에 쓴다.
// action 자리에는 MDS Text Button(size small, tone emphasis)을 넣는다.
export interface CalloutProps {
  tone?: "information" | "danger";
  icon?: boolean;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Callout({ tone = "information", icon = true, action, className, children }: CalloutProps) {
  const classNames = [styles.callout, styles[tone], className].filter(Boolean).join(" ");

  return (
    <div className={classNames} role={tone === "danger" ? "alert" : "status"}>
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element -- MDS 아이콘 SVG를 원본 크기 그대로 쓴다
        <img src={`/mds-icons/feedback-${tone}.svg`} alt="" width={20} height={20} />
      )}
      <div className={styles.contents}>
        <div className={styles.text}>{children}</div>
        {action}
      </div>
    </div>
  );
}
