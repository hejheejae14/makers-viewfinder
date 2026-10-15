import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Viewfinder",
  description: "메이커스 디자인 탐색 도구",
  // 내부 도구이므로 검색 엔진에 노출하지 않는다.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
