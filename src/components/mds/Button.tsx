import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

// MDS v2 Action Button. hover·press·disabled 상태는 브라우저 상태(:hover, :active, disabled)로 표현한다.
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "xsmall" | "small" | "medium" | "large";
  variant?: "primary" | "secondary" | "danger";
  prefixIcon?: ReactNode;
  suffixIcon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  size = "medium",
  variant = "primary",
  prefixIcon,
  suffixIcon,
  fullWidth = false,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const classNames = [styles.button, styles[size], styles[variant], fullWidth && styles.fullWidth, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classNames} {...rest}>
      {prefixIcon && <span className={styles.icon}>{prefixIcon}</span>}
      {children}
      {suffixIcon && <span className={styles.icon}>{suffixIcon}</span>}
    </button>
  );
}
