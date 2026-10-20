/**
 * MDS 라이브러리 Figma 파일. 컴포넌트가 이 두 파일에 있으면 MDS 컴포넌트이고, 아니면 MDS가 적용되지 않은 것으로 본다.
 * (파일 키는 비밀 값이 아니라 Figma 링크에 들어 있는 식별자입니다.)
 */
export const MDS_LIBRARIES = [
  { fileKey: "ZuAGH1zZDxduHsjCZm8kfH", version: "v1", name: "makers design system" },
  { fileKey: "bls70HvYNLDvfjs0iGcH2f", version: "v2", name: "makers design system v2" },
] as const;

export type MdsVersion = (typeof MDS_LIBRARIES)[number]["version"];

/** 컴포넌트 키 → MDS 버전 */
export type MdsComponentKeys = Map<string, MdsVersion>;

export function mdsLibraryName(version: MdsVersion): string {
  return MDS_LIBRARIES.find((library) => library.version === version)!.name;
}
