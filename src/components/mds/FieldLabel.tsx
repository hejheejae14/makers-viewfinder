import type { ReactNode } from "react";
import styles from "./FieldLabel.module.css";

// MDS v2 Input / TextField의 label + description 영역. Select 위에도 같은 모양으로 붙인다.
export interface FieldLabelProps {
  htmlFor?: string;
  id?: string;
  label?: ReactNode;
  required?: boolean;
  description?: ReactNode;
}

export function FieldLabel({ htmlFor, id, label, required = false, description }: FieldLabelProps) {
  if (!label && !description) return null;

  return (
    <div className={styles.labelArea}>
      {label && (
        <label className={styles.label} htmlFor={htmlFor} id={id}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}
