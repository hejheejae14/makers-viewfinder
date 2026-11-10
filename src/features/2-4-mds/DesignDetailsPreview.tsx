import { Callout } from "@/components/mds";
import { OtherVersions } from "@/features/2-3-other-versions/OtherVersions";
import { mockIndex, mockResults } from "@/lib/mock-data";
import { MdsUsage } from "./MdsUsage";
import styles from "./MdsUsage.module.css";

export function DesignDetailsPreview() {
  const examples = [
    { label: "다른 버전 있음 · MDS v2", ...mockResults[0] },
    { label: "다른 버전 정보 없음 · MDS v1", ...mockResults[1] },
    { label: "MDS v1·v2 혼합", screen: mockIndex.find((screen) => screen.id === "300:8")! },
    { label: "MDS 컴포넌트 없음으로 기록", screen: mockIndex.find((screen) => screen.id === "300:9")! },
    { label: "정보 미제공", screen: { ...mockResults[0].screen, components: [], tokens: [], elements: undefined } },
  ];
  return (
    <main className={styles.preview}>
      <h1 className="mds-heading2">2-3·2-4 화면 확인</h1>
      <Callout>개발용 가짜 데이터입니다. 실제 검색과 내부 인덱스를 사용하지 않으며, 원본 링크는 열리지 않습니다.</Callout>
      {examples.map((example) => (
        <section className={styles.example} key={example.label} aria-label={example.label}>
          <h2 className="mds-heading3">{example.label}</h2>
          <OtherVersions screen={example.screen} otherVersions={"otherVersions" in example ? example.otherVersions : undefined} />
          <MdsUsage screen={example.screen} />
        </section>
      ))}
    </main>
  );
}
