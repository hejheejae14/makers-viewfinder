import type { ReactNode } from "react";
import styles from "./TextButton.module.css";

// MDS v2 Text Button. href가 있으면 링크(<a>), 없으면 버튼으로 그린다.
export interface TextButtonProps {
  size?: "small" | "medium";
  tone?: "default" | "emphasis";
  disabled?: boolean;
  suffix?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

const ICON_SIZE = { small: 16, medium: 18 } as const;

export function TextButton({
  size = "small",
  tone = "default",
  disabled = false,
  suffix = true,
  href,
  onClick,
  className,
  children,
}: TextButtonProps) {
  const state = disabled ? "disabled" : tone;
  const classNames = [styles.textButton, styles[size], styles[state], className].filter(Boolean).join(" ");
  const iconSize = ICON_SIZE[size];
  const icon = suffix && (
    // eslint-disable-next-line @next/next/no-img-element -- MDS 아이콘 SVG를 원본 크기 그대로 쓴다
    <img src={`/mds-icons/text-button-${size}-${state}.svg`} alt="" width={iconSize} height={iconSize} />
  );

  if (href && !disabled) {
    return (
      <a className={classNames} href={href} target="_blank" rel="noreferrer">
        {children}
        {icon}
      </a>
    );
  }

  return (
    <button type="button" className={classNames} onClick={onClick} disabled={disabled}>
      {children}
      {icon}
    </button>
  );
}
