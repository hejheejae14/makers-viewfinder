"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Tag } from "@/components/mds";
import type { SearchResult } from "@/lib/types";
import styles from "./ResultsPane.module.css";

// 검색 결과 목록과 상세를 함께 놓는다.
// - 이미 팀을 골라 검색했으므로 목록에 팀 이름은 보여 주지 않는다.
// - 선택한 항목은 오른쪽 끝에 check 아이콘으로 표시한다. (MDS List/Default/Complicate)
// - 넓은 화면: 목록과 상세를 나란히.
// - 좁은 화면: 화면을 바꾸지 않고, 누른 항목 바로 아래에서 상세가 펼쳐진다. 다시 누르면 접히고, 한 번에 하나만 펼친다.
//   펼친 항목의 제목 줄은 상세를 스크롤하는 동안 위에 붙어 있다. (sticky)
interface ResultsPaneProps {
  results: SearchResult[];
  selectedId: string | null;
  /** 좁은 화면에서 선택한 항목의 상세를 펼칠지 (넓은 화면에서는 항상 보인다) */
  detailOpen: boolean;
  onSelect: (id: string) => void;
  /** 좁은 화면에서 펼친 항목을 다시 눌러 접을 때 */
  onClose: () => void;
  detail: ReactNode;
}

const NARROW = "(max-width: 960px)";

// 화면이 좁은지. 서버에서는 넓은 화면으로 그린 뒤 브라우저에서 바로 맞춘다.
function useNarrow() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

export function ResultsPane({
  results,
  selectedId,
  detailOpen,
  onSelect,
  onClose,
  detail,
}: ResultsPaneProps) {
  const narrow = useNarrow();
  return (
    <div className={styles.content}>
      <ul className={styles.list} aria-label="검색 결과">
        {results.map((result) => {
          const selected = result.screen.id === selectedId;
          const expanded = narrow && selected && detailOpen;
          return (
            <li key={result.screen.id} className={styles.entry}>
              <button
                type="button"
                className={styles.item}
                aria-current={selected}
                aria-expanded={narrow ? expanded : undefined}
                onClick={() =>
                  expanded ? onClose() : onSelect(result.screen.id)
                }
              >
                <span className={styles.verdict}>
                  <Tag size="small">{result.verdict}</Tag>
                </span>
                <span className={styles.row}>
                  <span className={styles.name}>{result.screen.name}</span>
                  {selected && (
                    // eslint-disable-next-line @next/next/no-img-element -- MDS 아이콘 SVG를 그대로 쓴다
                    <img
                      className={styles.check}
                      src="/mds-icons/check.svg"
                      alt="선택됨"
                      width={20}
                      height={20}
                    />
                  )}
                </span>
                {result.screen.section && (
                  <span className={styles.section}>
                    {result.screen.section}
                  </span>
                )}
              </button>
              {expanded && <div className={styles.inline}>{detail}</div>}
            </li>
          );
        })}
      </ul>

      {!narrow && <div className={styles.detailArea}>{detail}</div>}
    </div>
  );
}
