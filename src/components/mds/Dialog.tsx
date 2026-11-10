"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./Dialog.module.css";

// MDS v2 Dialog (Figma: ✅ Dialog > Basic). 화면 위에 띄워 중요한 정보를 주거나 작업을 끝내게 하는 상자.
// 브라우저 기본 <dialog>를 써서 Esc로 닫기, 포커스 가두기, 뒤 화면 막기를 그대로 얻는다.
// 열려 있는 동안에만 안쪽을 그리므로, 닫았다 다시 열면 안쪽 상태가 처음으로 돌아간다.
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** default는 Figma 기본 폭(400px), wide는 입력칸이 들어가는 모달용(560px) */
  size?: "default" | "wide";
  /** 아래쪽 버튼 영역. MDS Button 두 개(보조, 주요)를 넣는다 */
  actions?: ReactNode;
  /** false면 진행 중인 작업이 끝날 때까지 닫을 수 없다. (X 버튼, Esc, 배경 클릭 모두 막는다) */
  dismissible?: boolean;
  children?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = "default",
  actions,
  dismissible = true,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      // 어두운 배경(backdrop)을 누르면 닫는다. 상자 안쪽 클릭은 surface가 받으므로 여기까지 오지 않는다.
      onMouseDown={(event) => {
        if (dismissible && event.target === ref.current) onClose();
      }}
    >
      {open && (
        <div
          className={[styles.surface, size === "wide" && styles.wide]
            .filter(Boolean)
            .join(" ")}
        >
          <div className={styles.header}>
            <div className={styles.text}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {description && (
                <p className={styles.description}>{description}</p>
              )}
            </div>
            {/* PC 기준: 닫기는 오른쪽 위 아이콘 버튼 (MDS icon_xClose) */}
            <button
              type="button"
              className={styles.close}
              aria-label="닫기"
              disabled={!dismissible}
              onClick={onClose}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- MDS 아이콘 SVG를 원본 크기 그대로 쓴다 */}
              <img src="/mds-icons/x-close.svg" alt="" width={24} height={24} />
            </button>
          </div>
          {children && <div className={styles.body}>{children}</div>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
    </dialog>
  );
}
