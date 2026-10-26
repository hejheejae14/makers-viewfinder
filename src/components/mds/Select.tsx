"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FieldLabel } from "./FieldLabel";
import styles from "./Select.module.css";

// MDS v2 Select (Single). 누르면 아래에 Select / Menu(Text)가 열린다.
// 선택된 항목에는 MDS 메뉴의 check 표시를 붙인다.
export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: ReactNode;
  description?: ReactNode;
  required?: boolean;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "선택해 주세요",
  label,
  description,
  required,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const menuId = `${baseId}-menu`;
  const selected = options.find((option) => option.value === value);

  // 메뉴 바깥을 누르면 닫는다.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function openMenu() {
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  }

  function choose(option: SelectOption) {
    onChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (options[activeIndex]) choose(options[activeIndex]);
    }
  }

  const classNames = [styles.field, open && styles.open, className].filter(Boolean).join(" ");

  return (
    <div className={classNames}>
      <FieldLabel id={labelId} label={label} required={required} description={description} />
      <div className={styles.wrapper} ref={wrapperRef}>
        <button
          type="button"
          className={styles.trigger}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={menuId}
          aria-labelledby={label ? labelId : undefined}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={handleKeyDown}
        >
          <span className={selected ? styles.value : `${styles.value} ${styles.placeholder}`}>
            {selected ? selected.label : placeholder}
          </span>
          <span className={styles.chevron}>
            {/* eslint-disable-next-line @next/next/no-img-element -- MDS 아이콘 SVG를 원본 크기 그대로 쓴다 */}
            <img src={open ? "/mds-icons/chevron-up.svg" : "/mds-icons/chevron-down.svg"} alt="" width={20} height={20} />
          </span>
        </button>
        {open && (
          <ul className={styles.menu} id={menuId} role="listbox" aria-labelledby={label ? labelId : undefined}>
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  className={index === activeIndex ? `${styles.item} ${styles.activeItem}` : styles.item}
                  onPointerEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                >
                  <span className={styles.itemText}>
                    <span className={styles.itemLabel}>{option.label}</span>
                    {option.description && <span className={styles.itemDescription}>{option.description}</span>}
                  </span>
                  {isSelected && (
                    // eslint-disable-next-line @next/next/no-img-element -- MDS 아이콘 SVG를 원본 크기 그대로 쓴다
                    <img src="/mds-icons/check.svg" alt="" width={20} height={20} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
