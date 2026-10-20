/**
 * 컴포넌트가 속한 라이브러리 파일 이름으로 MDS 여부와 버전을 판별합니다.
 * 예: "🚀 makers design system" → MDS v1, "🚀 makers design system v2" → MDS v2
 */
export function classifyLibrary(libraryName: string | undefined): {
  isMds: boolean;
  mdsVersion?: "v1" | "v2";
} {
  if (!libraryName || !/makers design system/i.test(libraryName)) return { isMds: false };
  return { isMds: true, mdsVersion: /v2\s*$/i.test(libraryName.trim()) ? "v2" : "v1" };
}
