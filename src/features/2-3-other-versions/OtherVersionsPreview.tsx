import { Callout } from "@/components/mds";
import { mockResults } from "@/lib/mock-data";
import { OtherVersions } from "./OtherVersions";
import styles from "./OtherVersions.module.css";

export function OtherVersionsPreview() {
  return (
    <main className={styles.preview}>
      <h1 className="mds-heading2">2-3 다른 버전 확인</h1>
      <Callout>개발 확인용 가짜 데이터입니다. 실제 검색을 실행하지 않으며 Figma 원본 링크는 열 수 없습니다.</Callout>
      {mockResults.map((result) => (
        <OtherVersions key={result.screen.id} screen={result.screen} otherVersions={result.otherVersions} />
      ))}
      <OtherVersions screen={mockResults[0].screen} otherVersions={[]} />
    </main>
  );
}
