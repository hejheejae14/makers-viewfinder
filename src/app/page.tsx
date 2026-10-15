import { mockResults } from "@/lib/mock-data";

// 임시 첫 화면입니다. 실제 화면은 0. 공통 뼈대 담당자가 디자인에 맞춰 교체합니다.
export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Viewfinder</h1>
      <p>기본 설치가 완료되었습니다. 아래는 공통 데이터 형식으로 만든 가짜 검색 결과입니다.</p>
      <ul style={{ marginTop: 16, paddingLeft: 20 }}>
        {mockResults.map((result) => (
          <li key={result.screen.id}>
            [{result.verdict}] {result.screen.teamPage} / {result.screen.name}
          </li>
        ))}
      </ul>
    </main>
  );
}
