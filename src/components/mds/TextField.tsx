import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { FieldLabel } from "./FieldLabel";
import styles from "./TextField.module.css";

// MDS v2 Input / TextField. Active(입력 중)는 :focus, Filled는 값이 있는 상태로 브라우저가 표현한다.
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  variant?: "default" | "bold";
  label?: ReactNode;
  description?: ReactNode;
  helperText?: ReactNode;
  /** 값이 있으면 helperText 대신 빨간 오류 문구로 보여 준다 */
  errorMessage?: ReactNode;
  /** 예: "12/100" */
  counter?: string;
}

export function TextField({
  variant = "default",
  label,
  description,
  helperText,
  errorMessage,
  counter,
  required,
  disabled,
  id,
  className,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperId = `${inputId}-helper`;
  const hasError = Boolean(errorMessage);
  const showHelper = hasError || Boolean(helperText) || Boolean(counter);

  const classNames = [
    styles.field,
    styles[variant],
    hasError && styles.error,
    disabled && styles.disabledField,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames}>
      <FieldLabel htmlFor={inputId} label={label} required={required} description={description} />
      <div className={styles.inputArea}>
        <input
          id={inputId}
          className={styles.input}
          required={required}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={showHelper ? helperId : undefined}
          {...inputProps}
        />
        {showHelper && (
          <div className={styles.helper} id={helperId}>
            {hasError ? (
              <span className={styles.errorMessage}>
                {/* eslint-disable-next-line @next/next/no-img-element -- MDS 아이콘 SVG를 원본 크기 그대로 쓴다 */}
                <img src="/mds-icons/info-circle-danger.svg" alt="" width={14} height={14} />
                {errorMessage}
              </span>
            ) : (
              helperText && <span className={styles.helperText}>{helperText}</span>
            )}
            {counter && <span className={styles.counter}>{counter}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
