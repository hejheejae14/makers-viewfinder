"use client";

import { useState } from "react";
import { TextField, TopNavigation } from "@/components/mds";
import { getMdsV2Cases } from "@/features/3-2-mds-v2-compare/compare";
import { MdsCompare } from "@/features/3-2-mds-v2-compare/MdsCompare";
import { mockIndex, mockResults } from "@/lib/mock-data";
import type { IndexedScreen } from "@/lib/types";
import styles from "./page.module.css";

const [result] = mockResults;

// 제품의 실제 인덱스 없이 subtle과 ghost를 비교하기 위한 가상의 화면입니다.
const ghostExample: IndexedScreen = {
  id: "900:1",
  fileKey: "MOCK_FILE_KEY",
  teamPage: "크루",
  section: "크루 관리",
  name: "W375/MO/크루_초대_Empty",
  texts: ["아직 받은 초대가 없어요", "크루 둘러보기"],
  components: [
    { name: "EmptyState", isMds: true, mdsVersion: "v2" },
    { name: "Button", variant: "ghost", isMds: true, mdsVersion: "v2" },
  ],
  tokens: ["color/text/secondary", "spacing/24"],
  elements: [
    {
      id: "900:11",
      component: "EmptyState",
      mdsVersion: "v2",
      tokens: ["color/text/secondary"],
      texts: ["아직 받은 초대가 없어요"],
      box: { x: 24, y: 270, width: 327, height: 110 },
    },
    {
      id: "900:12",
      component: "Button",
      variant: "ghost",
      mdsVersion: "v2",
      tokens: ["spacing/24"],
      texts: ["크루 둘러보기"],
      box: { x: 24, y: 410, width: 327, height: 48 },
    },
  ],
  figmaUrl: "https://www.figma.com/design/MOCK_FILE_KEY/mock?node-id=900-1",
  syncedAt: result.screen.syncedAt,
};

const screens = [ghostExample, ...mockIndex.filter(({ id }) => id !== "500:5")];
const exampleReasons: Record<string, string> = {
  "100:2": "게시물이 없는 홈에서 EmptyState와 게시물 쓰기 버튼을 함께 보여줘요.",
  "900:1": "보여줄 초대가 없는 상태를 안내하고, 둘러보기 버튼으로 다음 행동을 제공해요.",
  "300:5": "보여줄 항목이 없을 때 EmptyState로 상태를 전달해요.",
};
const exampleCases = getMdsV2Cases(result, screens.filter(({ id }) => id in exampleReasons))
  .map((item) => ({ ...item, reason: exampleReasons[item.screen.id] }));

export default function MdsComparePreviewPage() {
  const [apiKey, setApiKey] = useState("");

  return (
    <>
      <TopNavigation
        className={styles.navigation}
        title={<span className={styles.wordmark}>Viewfinder</span>}
        right={<span className={styles.badge}>기능 미리보기</span>}
      />
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>CONTINUE · 3-2</p>
          <h1>MDS v2 사용 사례 비교</h1>
          <p>비슷한 상황에서 다른 화면이 어떤 컴포넌트, variant, 토큰을 사용했는지 살펴보세요.</p>
        </header>
        <details className={styles.key}>
          <summary>개인 키로 예시 화면 AI 비교하기</summary>
          <TextField
            type="password"
            autoComplete="off"
            label="Gemini API 키"
            helperText="입력한 키는 이 페이지에서 Gemini 요청에만 사용합니다. 예시 화면의 정보가 Gemini로 전달됩니다."
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </details>
        <MdsCompare result={result} screens={screens} apiKey={apiKey} exampleCases={exampleCases} />
      </main>
    </>
  );
}
