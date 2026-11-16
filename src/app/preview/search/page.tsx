"use client";

import { useEffect, useState } from "react";
import { SearchView } from "@/features/0-common-shell/SearchView";
import { loadTeamIndex } from "@/features/2-1-search/index-client";
import { useSession } from "@/lib/session";
import type { SearchResponse } from "@/lib/types";

// 실제 검색 화면(SearchView)을 "검색 없이" 띄워 보는 확인용 페이지입니다.
// 로컬에 있는 진짜 플그 인덱스에서 "프로젝트 등록" 화면을 그대로 가져옵니다. (AI 검색은 돌리지 않아 개인 AI 키를 쓰지 않아요.)
// 화면 이미지는 실제 화면과 같이 Figma 팀 공용 토큰으로 받아 옵니다.

const KEYWORD = "프로젝트 등록";

export default function SearchPreviewPage() {
  const session = useSession();
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const password = session?.password;
  useEffect(() => {
    if (!password) return;
    loadTeamIndex({ team: "플그", teamPassword: password })
      .then((index) => {
        const screens = index.screens
          .filter(
            (item) =>
              item.name.includes(KEYWORD) || item.section?.includes(KEYWORD),
          )
          .slice(0, 10);
        setResponse({
          query: `${KEYWORD} 화면`,
          team: "플그",
          results: screens.map((screen) => ({
            screen,
            verdict: "정답 후보",
            reasons: ["확인용 화면: 인덱스에 있는 실제 화면이에요."],
          })),
        });
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "불러오지 못했어요.",
        ),
      );
  }, [password]);

  if (error) return <p>{error}</p>;
  if (!response) return null;
  return <SearchView previewResponse={response} />;
}
