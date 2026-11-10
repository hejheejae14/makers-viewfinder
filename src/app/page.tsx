"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";

// 첫 화면: 저장된 설정(팀 비밀번호·개인 API 키)이 있으면 검색 화면으로, 없으면 첫 진입 설정 화면으로 보낸다.
export default function Home() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session === undefined) return;
    router.replace(session ? "/search" : "/setup");
  }, [session, router]);

  return null;
}
