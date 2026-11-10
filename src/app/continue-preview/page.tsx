import { TopNavigation } from "@/components/mds/TopNavigation";
import { AiHandoff } from "@/features/3-1-ai-handoff/AiHandoff";
import { mockResults } from "@/lib/mock-data";
import styles from "./page.module.css";

export default function ContinuePreviewPage() {
  const [result] = mockResults;
  const { screen } = result;

  return (
    <>
      <TopNavigation
        className={styles.navigation}
        title={
          <span className={styles.wordmark}>
            <span className={styles.mark} aria-hidden="true">V</span>
            Viewfinder
          </span>
        }
        right={<span className={styles.badge}>기능 미리보기</span>}
      />
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>CONTINUE · 3-1</p>
          <h1>찾은 화면에서 다음 작업으로</h1>
          <p>예시 검색 결과를 바탕으로 후속 작업을 선택하고 AI 채팅으로 이어가 보세요.</p>
        </header>
        <div className={styles.layout}>
          <aside className={styles.context} aria-labelledby="example-result">
            <p className={styles.eyebrow}>예시 검색 결과</p>
            <h2 id="example-result">앱 홈 빈 상태</h2>
            <p>{result.summary}</p>
            <div className={styles.example} aria-label="예시 화면에 표시된 문구">
              <span className={styles.exampleTop}>홈</span>
              <div className={styles.emptyState}>
                <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <rect x="5" y="7" width="22" height="18" rx="3" />
                  <path d="M10 13h12M10 18h8" />
                </svg>
                <strong>{screen.texts[0]}</strong>
                <span>{screen.texts[1]}</span>
              </div>
            </div>
            <dl className={styles.details}>
              <div><dt>팀</dt><dd>{screen.teamPage}</dd></div>
              <div><dt>기능</dt><dd>{screen.section}</dd></div>
              <div>
                <dt>컴포넌트</dt>
                <dd>{screen.components.map(({ name }) => name).join(", ")}</dd>
              </div>
            </dl>
          </aside>
          <AiHandoff result={result} />
        </div>
      </main>
    </>
  );
}
