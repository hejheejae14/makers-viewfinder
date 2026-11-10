"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Button,
  Callout,
  Dialog,
  Select,
  TextButton,
  TextField,
  TopNavigation,
} from "@/components/mds";
import { SyncPanel } from "@/features/1-1-index-sync/SyncPanel";
import { SetupForm } from "@/features/1-2-auth-key/SetupView";
import { loadTeamIndex } from "@/features/2-1-search/index-client";
import { createGeminiSearchAi } from "@/features/2-1-search/gemini";
import { searchTeam } from "@/features/2-1-search/search";
import { ScreenInfo } from "@/features/2-2-screen-info/ScreenInfo";
import { OtherVersions } from "@/features/2-3-other-versions/OtherVersions";
import { MdsUsage } from "@/features/2-4-mds/MdsUsage";
import { AiHandoff } from "@/features/3-1-ai-handoff/AiHandoff";
import { MdsCompare } from "@/features/3-2-mds-v2-compare/MdsCompare";
import { useSession } from "@/lib/session";
import type {
  SearchResponse,
  SearchResult,
  TeamIndex,
  TeamPage,
} from "@/lib/types";
import styles from "./SearchView.module.css";

// 0. 공통 뼈대: 검색 → 결과 확인(2-2 ~ 2-4, 3-1) → MDS v2 사용 사례 비교(3-2)를 한 흐름으로 잇는다.
// 각 기능의 화면(ScreenInfo, OtherVersions, MdsUsage, AiHandoff, MdsCompare)은 모양을 바꾸지 않고 그대로 가져다 쓴다.
// 2-1 검색 화면은 아직 합쳐진 디자인이 없어, MDS 부품만 쓴 임시 검색창과 결과 목록을 둔다. 2-1 화면이 합쳐지면 이 부분만 교체한다.
// 팀 비밀번호와 개인 API 키는 1-2에서 이 브라우저에 저장한 값을 쓴다.

const TEAMS: TeamPage[] = ["앱", "플그", "크루", "공홈", "어드민"];
const TEAM_OPTIONS = TEAMS.map((team) => ({ value: team, label: team }));

type Phase =
  | { status: "idle" | "loading" }
  | { status: "ready"; response: SearchResponse }
  | { status: "error"; message: string };

export function SearchView() {
  const router = useRouter();
  const session = useSession();
  const request = useRef<AbortController | null>(null);
  const [team, setTeam] = useState<TeamPage>("앱");
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  // 설정과 인덱스 동기화는 이 화면 위에 모달로 띄운다.
  const [modal, setModal] = useState<"settings" | "sync" | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [indexes, setIndexes] = useState<
    Partial<Record<TeamPage, TeamIndex | "error">>
  >({});
  // 화면 이미지: Figma에서 받은 임시 주소(저장하지 않음)와 실패 이유를 화면 ID별로 기억한다.
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});

  // 저장된 설정이 없으면 첫 진입 화면으로 보낸다.
  useEffect(() => {
    if (session === null) router.replace("/setup");
  }, [session, router]);

  // 선택한 팀의 인덱스를 읽어 둔다. (3-2 비교 후보와 마지막 동기화 날짜에 쓴다.)
  const password = session?.password;
  const index = indexes[team];
  useEffect(() => {
    if (!password || index !== undefined) return;
    const controller = new AbortController();
    loadTeamIndex({ team, teamPassword: password, signal: controller.signal })
      .then((loaded) =>
        setIndexes((current) => ({ ...current, [team]: loaded })),
      )
      .catch(() => {
        if (!controller.signal.aborted)
          setIndexes((current) => ({ ...current, [team]: "error" }));
      });
    return () => controller.abort();
  }, [team, password, index]);

  useEffect(() => () => request.current?.abort(), []);

  const results = phase.status === "ready" ? phase.response.results : [];
  const selected: SearchResult | undefined = results.find(
    (result) => result.screen.id === selectedId,
  );

  // 선택한 결과의 화면 이미지를 팀 공용 토큰으로 받아 온다. (서버가 임시 주소만 돌려준다.)
  const selectedScreenId = selected?.screen.id;
  const imageKnown = selectedScreenId
    ? Boolean(imageUrls[selectedScreenId] || imageErrors[selectedScreenId])
    : true;
  useEffect(() => {
    if (!password || !selectedScreenId || imageKnown) return;
    const controller = new AbortController();
    fetch("/api/screen-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-team-password": password,
      },
      body: JSON.stringify({ nodeId: selectedScreenId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          url?: string;
          error?: string;
        } | null;
        if (!response.ok || !body?.url)
          throw new Error(
            body?.error ??
              `화면 이미지를 가져오지 못했어요. (${response.status})`,
          );
        setImageUrls((current) => ({
          ...current,
          [selectedScreenId]: body.url as string,
        }));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error
            ? error.message
            : "화면 이미지를 가져오지 못했어요.";
        setImageErrors((current) => ({
          ...current,
          [selectedScreenId]: message,
        }));
      });
    return () => controller.abort();
  }, [password, selectedScreenId, imageKnown]);

  if (!session) return null;

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setPhase({ status: "loading" });
    setSelectedId(null);
    try {
      const ai = createGeminiSearchAi(session.apiKey);
      const response = await searchTeam({
        query,
        team,
        teamPassword: session.password,
        ai,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPhase({ status: "ready", response });
      setSelectedId(response.results[0]?.screen.id ?? null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({
        status: "error",
        message: error instanceof Error ? error.message : "검색하지 못했어요.",
      });
    }
  }

  const syncedAt = index && index !== "error" ? index.syncedAt : undefined;
  const wordmark = <span className={styles.wordmark}>Viewfinder</span>;

  if (comparing && selected) {
    return (
      <>
        <TopNavigation
          className={styles.navigation}
          title={wordmark}
          right={
            <TextButton suffix={false} onClick={() => setComparing(false)}>
              검색 결과로 돌아가기
            </TextButton>
          }
        />
        <main className={styles.compare}>
          {index && index !== "error" ? (
            <MdsCompare
              result={selected}
              screens={index.screens}
              apiKey={session.apiKey}
            />
          ) : index === "error" ? (
            <Callout tone="danger">
              검색 인덱스를 불러오지 못해 사용 사례를 비교할 수 없어요. 검색
              화면에서 다시 시도해 주세요.
            </Callout>
          ) : (
            <Callout>비교할 화면을 불러오는 중이에요…</Callout>
          )}
        </main>
      </>
    );
  }

  return (
    <>
      <TopNavigation
        className={styles.navigation}
        title={wordmark}
        right={
          <div className={styles.nav}>
            <span className={styles.synced}>
              검색 인덱스 마지막 동기화:{" "}
              {syncedAt ? new Date(syncedAt).toLocaleDateString("ko-KR") : "-"}
            </span>
            <TextButton suffix={false} onClick={() => setModal("sync")}>
              인덱스 동기화
            </TextButton>
            <TextButton suffix={false} onClick={() => setModal("settings")}>
              설정
            </TextButton>
          </div>
        }
      />
      <Dialog
        open={modal === "settings"}
        onClose={() => setModal(null)}
        title="설정"
      >
        <SetupForm variant="modal" onDone={() => setModal(null)} />
      </Dialog>
      <Dialog
        open={modal === "sync"}
        dismissible={!syncBusy}
        onClose={() => setModal(null)}
        size="wide"
        title="인덱스 동기화"
      >
        <SyncPanel password={session.password} onBusyChange={setSyncBusy} />
      </Dialog>
      <main className={styles.page}>
        <form className={styles.searchBar} onSubmit={search}>
          <div className={styles.team}>
            <Select
              label="팀"
              options={TEAM_OPTIONS}
              value={team}
              onChange={(value) => {
                setTeam(value as TeamPage);
                setPhase({ status: "idle" });
                setSelectedId(null);
              }}
            />
          </div>
          <TextField
            className={styles.query}
            label="찾고 싶은 화면"
            placeholder="예: 커뮤니티 댓글 언급 기능 찾아줘"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          <Button
            type="submit"
            disabled={phase.status === "loading" || !query.trim()}
          >
            {phase.status === "loading" ? "찾는 중…" : "검색"}
          </Button>
        </form>

        {phase.status === "idle" && (
          <Callout>팀을 고르고 찾고 싶은 화면이나 기능을 적어 주세요.</Callout>
        )}
        {phase.status === "loading" && (
          <Callout>검색 인덱스에서 화면을 찾고 있어요.</Callout>
        )}
        {phase.status === "error" && (
          <Callout tone="danger">{phase.message}</Callout>
        )}
        {phase.status === "ready" && results.length === 0 && (
          <Callout>
            찾지 못함: 이 팀 인덱스에서 조건을 모두 만족하는 화면이 없어요.
          </Callout>
        )}

        {results.length > 0 && (
          <div className={styles.content}>
            <ul className={styles.results} aria-label="검색 결과">
              {results.map((result) => (
                <li key={result.screen.id}>
                  <button
                    type="button"
                    className={styles.item}
                    aria-pressed={result.screen.id === selectedId}
                    onClick={() => setSelectedId(result.screen.id)}
                  >
                    <span className={styles.verdict}>{result.verdict}</span>
                    <strong>{result.screen.name}</strong>
                    <span className={styles.meta}>
                      {[result.screen.teamPage, result.screen.section]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {selected && (
              <div className={styles.detail}>
                <div className={styles.panel}>
                  <ScreenInfo
                    result={selected}
                    thumbnailUrl={imageUrls[selected.screen.id]}
                    thumbnailNote={
                      imageErrors[selected.screen.id] ??
                      (imageUrls[selected.screen.id]
                        ? undefined
                        : "이미지를 불러오는 중…")
                    }
                  />
                </div>
                <OtherVersions
                  screen={selected.screen}
                  otherVersions={selected.otherVersions}
                />
                <MdsUsage screen={selected.screen} />
                <div>
                  <Button onClick={() => setComparing(true)}>
                    MDS v2 사용 사례 비교
                  </Button>
                </div>
                <AiHandoff result={selected} />
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
