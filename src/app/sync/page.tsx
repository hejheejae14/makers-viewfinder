"use client";

import { TextButton } from "@/components/mds";
import { SyncPanel } from "@/features/1-1-index-sync/SyncPanel";

// /sync 주소로 직접 들어왔을 때의 페이지입니다. 검색 화면에서는 같은 내용(SyncPanel)을 모달로 엽니다.
export default function SyncPage() {
  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <TextButton href="/search">검색으로 돌아가기</TextButton>
      <h1>인덱스 동기화</h1>
      <SyncPanel />
    </main>
  );
}
