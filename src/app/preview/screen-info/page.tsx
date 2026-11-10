import { ScreenInfo } from "@/features/2-2-screen-info/ScreenInfo";
import { mockResults } from "@/lib/mock-data";
import styles from "./page.module.css";

// 2-2 화면 정보를 가짜 데이터로 확인하는 페이지입니다. 검색 화면이 완성되면 그 화면의 상세 영역에서 ScreenInfo를 씁니다.
export default function ScreenInfoPreviewPage() {
  return (
    <main className={styles.page}>
      {mockResults.map((result) => (
        <div key={result.screen.id} className={styles.panel}>
          <ScreenInfo result={result} />
        </div>
      ))}
    </main>
  );
}
