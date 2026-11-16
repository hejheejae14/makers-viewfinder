"use client";

import { useState } from "react";
import { ResultsPane } from "@/features/0-common-shell/ResultsPane";
import { mockResults } from "@/lib/mock-data";

// 검색 결과 목록·상세 배치를 가짜 데이터로 확인하는 페이지입니다. (넓은 화면 / 좁은 화면 모두 확인)
export default function SearchResultsPreviewPage() {
  const [selectedId, setSelectedId] = useState<string | null>(
    mockResults[0]?.screen.id ?? null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const selected = mockResults.find(
    (result) => result.screen.id === selectedId,
  );

  return (
    <main style={{ padding: "var(--mds-space-24) var(--mds-space-32)" }}>
      <ResultsPane
        results={mockResults}
        selectedId={selectedId}
        detailOpen={detailOpen}
        onSelect={(id) => {
          setSelectedId(id);
          setDetailOpen(true);
        }}
        onClose={() => setDetailOpen(false)}
        detail={
          <div
            style={{
              padding: "var(--mds-space-24)",
              borderRadius: "var(--mds-radius-12)",
              background: "var(--mds-bg-layer-layer-default)",
              color: "var(--mds-fg-neutral-bold)",
            }}
          >
            {selected?.screen.name} 상세 (가짜 데이터)
          </div>
        }
      />
    </main>
  );
}
