import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ADMIN_COOKIE, validAdminSession } from "@/features/2-1-search/admin-auth";
import AdminSearch from "@/features/2-1-search/admin-search";

export const metadata = { title: "2-1 검색 테스트 | Viewfinder", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense fallback={<p>관리자 권한 확인 중…</p>}><AdminPage /></Suspense>;
}

async function AdminPage() {
  // 세션 만료는 현재 시각으로 검사하므로 실제 요청이 도착한 뒤 실행한다.
  await connection();
  const authenticated = validAdminSession((await cookies()).get(ADMIN_COOKIE)?.value);
  return <AdminSearch authenticated={authenticated} />;
}
