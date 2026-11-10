"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Callout,
  Select,
  TextButton,
  TextField,
} from "@/components/mds";
import { useSession } from "@/lib/session";
import styles from "./SyncPanel.module.css";

// 1-1 인덱스 동기화 화면의 알맹이입니다. 검색 화면의 모달과 /sync 페이지가 함께 씁니다.
// 자주 하는 일(팀 페이지 동기화)을 맨 위에 두고, 가끔 하는 일(Figma 토큰 등록·교체)은 아래 한 줄로 접어 둡니다.
// 팀 비밀번호는 1-2에서 저장해 둔 값을 쓰고, 저장된 값이 없을 때만 직접 입력받습니다.
// Figma 토큰은 팀 공용 읽기 전용 토큰 하나를 이 화면에서 등록합니다. 등록한 토큰은 서버(Redis)에 보관되며
// 동기화와 화면 이미지가 함께 씁니다. 이 화면에는 값을 남기지 않고 서버도 값을 다시 돌려주지 않습니다. (팀 합의 필요)

const TEAMS = ["앱", "플그", "크루", "공홈", "어드민"] as const;
type Team = (typeof TEAMS)[number];
const TEAM_OPTIONS = TEAMS.map((name) => ({ value: name, label: name }));

interface Progress {
  done: number;
  total: number;
  finished: boolean;
}

interface Status {
  index: {
    syncedAt: string;
    screens: number;
    excluded: number;
    excludedByReason: Record<string, { count: number; examples: string[] }>;
  } | null;
  pending: Progress | null;
}

interface TokenStatus {
  configured: boolean;
  savedAt: string | null;
}

type Notice = { tone: "information" | "danger"; text: string };

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "알 수 없는 오류가 났어요.";
const dateText = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function SyncPanel({
  password: givenPassword,
  onBusyChange,
}: {
  password?: string;
  /** 동기화가 도는 동안 true. 모달이 이 값으로 닫기를 막는다. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const session = useSession();
  const [typedPassword, setTypedPassword] = useState("");
  const knownPassword = givenPassword ?? session?.password;
  const password = knownPassword ?? typedPassword;

  const [team, setTeam] = useState<Team>("앱");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sharedToken, setSharedToken] = useState("");
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [tokenNotice, setTokenNotice] = useState<Notice | null>(null);
  const [editingToken, setEditingToken] = useState(false);

  const call = useCallback(
    async (action: "status" | "start" | "continue") => {
      const response = await fetch("/api/index-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-team-password": password,
        },
        body: JSON.stringify({ action, team }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          data.error ?? `요청에 실패했어요. (${response.status})`,
        );
      return data;
    },
    [password, team],
  );

  const callToken = useCallback(
    async (action: "status" | "set" | "clear", token?: string) => {
      const response = await fetch("/api/figma-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-team-password": password,
        },
        body: JSON.stringify({ action, ...(token ? { token } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          data.error ?? `요청에 실패했어요. (${response.status})`,
        );
      return data as TokenStatus;
    },
    [password],
  );

  // 열릴 때와 팀 페이지를 바꿀 때 현재 인덱스 상태를 자동으로 읽어 온다.
  useEffect(() => {
    if (!password) return;
    let cancelled = false;
    call("status")
      .then((data) => {
        if (!cancelled) setStatus(data as Status);
      })
      .catch((error) => {
        if (!cancelled) setNotice({ tone: "danger", text: errorText(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [call, password]);

  useEffect(() => {
    if (!password) return;
    let cancelled = false;
    callToken("status")
      .then((data) => {
        if (!cancelled) setTokenStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [callToken, password]);

  // 팀 페이지를 바꾸면 이전 팀의 진행 상황과 인덱스 정보가 남아 있지 않도록 지운다.
  function changeTeam(next: string) {
    setTeam(next as Team);
    setStatus(null);
    setProgress(null);
    setNotice(null);
  }

  async function sync(restart: boolean) {
    setBusy(true);
    setNotice(null);
    try {
      if (restart) setProgress((await call("start")) as Progress);
      // 서버는 한 번에 시간 예산만큼만 읽으므로, 끝날 때까지 반복해서 부른다.
      for (;;) {
        const next = (await call("continue")) as Progress;
        setProgress(next);
        if (next.finished) break;
      }
      setStatus((await call("status")) as Status);
    } catch (error) {
      setNotice({ tone: "danger", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function changeToken(action: "set" | "clear") {
    setTokenNotice(null);
    try {
      setTokenStatus(
        await callToken(action, action === "set" ? sharedToken : undefined),
      );
      if (action === "set") {
        setSharedToken("");
        setEditingToken(false);
      }
    } catch (error) {
      setTokenNotice({ tone: "danger", text: errorText(error) });
    }
  }

  const noToken = tokenStatus?.configured === false;
  const showTokenForm = noToken || editingToken;

  return (
    <div className={styles.panel}>
      {!knownPassword && (
        <TextField
          label="팀 비밀번호"
          type="password"
          autoComplete="off"
          value={typedPassword}
          onChange={(event) => setTypedPassword(event.target.value)}
        />
      )}

      {/* 1. 자주 하는 일: 팀 페이지를 골라 동기화 */}
      <div className={styles.group}>
        <Select
          variant="default"
          label="팀 페이지"
          options={TEAM_OPTIONS}
          value={team}
          onChange={changeTeam}
        />

        <div className={styles.facts}>
          <dl className={styles.rows}>
            {status ? (
              status.index ? (
                <>
                  <div>
                    <dt>마지막 동기화</dt>
                    <dd>{dateText(status.index.syncedAt)}</dd>
                  </div>
                  <div>
                    <dt>화면</dt>
                    <dd>{status.index.screens}개</dd>
                  </div>
                  <div>
                    <dt>제외한 프레임</dt>
                    <dd>{status.index.excluded}개</dd>
                  </div>
                </>
              ) : (
                <p className={styles.text}>아직 동기화한 적이 없어요.</p>
              )
            ) : (
              <p className={styles.text}>인덱스 상태를 확인하는 중…</p>
            )}
          </dl>
          {status?.index && status.index.excluded > 0 && (
            <details className={styles.details}>
              <summary>제외한 프레임 이유 보기</summary>
              <ul>
                {Object.entries(status.index.excludedByReason).map(
                  ([reason, { count, examples }]) => (
                    <li key={reason}>
                      {reason}: {count}개 (예: {examples.join(", ")})
                    </li>
                  ),
                )}
              </ul>
            </details>
          )}
        </div>

        {/* 오류는 현황 박스 바로 아래, 버튼 위에 보여 준다. */}
        {notice && <Callout tone={notice.tone}>{notice.text}</Callout>}

        {/* 진행 중에는 버튼 대신 진행 상황과 안내를 한 덩어리로 보여 준다. */}
        {busy ? (
          <div className={styles.progress} aria-live="polite">
            <progress
              value={progress?.done ?? 0}
              max={Math.max(progress?.total ?? 0, 1)}
            />
            <span className={styles.progressLine}>
              <span>동기화하는 중</span>
              <span>
                {progress?.done ?? 0} / {progress?.total ?? "…"} 구역
              </span>
            </span>
            <span className={styles.text}>
              끝날 때까지 이 창을 열어 두세요. 구역이 많으면 몇 분 걸려요.
            </span>
          </div>
        ) : (
          <div className={styles.actions}>
            {status?.pending && (
              <Button
                variant="secondary"
                disabled={!password || noToken}
                onClick={() => void sync(false)}
              >
                이어서 동기화 ({status.pending.done}/{status.pending.total})
              </Button>
            )}
            <Button
              disabled={!password || noToken}
              onClick={() => void sync(true)}
            >
              동기화
            </Button>
          </div>
        )}
      </div>

      {/* 2. 가끔 하는 일: Figma 토큰. 등록돼 있으면 한 줄로 접어 둔다. */}
      <div className={styles.token}>
        <div className={styles.tokenRow}>
          <div className={styles.tokenInfo}>
            <span className={styles.tokenLabel}>공통 Figma 토큰</span>
            <span className={styles.text}>
              {tokenStatus
                ? tokenStatus.configured
                  ? tokenStatus.savedAt
                    ? `${dateText(tokenStatus.savedAt)}에 등록됨`
                    : "등록됨"
                  : "아직 등록하지 않았어요"
                : "확인하는 중…"}
            </span>
          </div>
          {tokenStatus?.configured && !editingToken && (
            <TextButton suffix={false} onClick={() => setEditingToken(true)}>
              교체
            </TextButton>
          )}
        </div>

        {noToken && (
          <Callout>
            동기화와 화면 이미지를 쓰려면 Figma 토큰을 먼저 등록해 주세요.
          </Callout>
        )}

        {showTokenForm && (
          <div className={styles.tokenForm}>
            <TextField
              type="password"
              autoComplete="off"
              aria-label="새 Figma 토큰"
              placeholder="토큰을 붙여 넣어 주세요"
              value={sharedToken}
              onChange={(event) => setSharedToken(event.target.value)}
            />
            <div className={styles.actions}>
              {editingToken && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingToken(false);
                    setSharedToken("");
                    setTokenNotice(null);
                  }}
                >
                  취소
                </Button>
              )}
              <Button
                disabled={!password || !sharedToken.trim()}
                onClick={() => void changeToken("set")}
              >
                등록
              </Button>
            </div>
            <details className={styles.details}>
              <summary>토큰 만드는 방법</summary>
              <p>
                Figma의 Settings → Security → Personal access tokens에서 만들고,
                파일 내용 읽기와 디자인 시스템(컴포넌트, 스타일) 읽기만
                선택하세요. 토큰은 서버에 보관되며 다시 보이지 않아요. 만료되면
                여기서 새 토큰으로 바꿔 주세요.
              </p>
            </details>
          </div>
        )}
        {tokenNotice && (
          <Callout tone={tokenNotice.tone}>{tokenNotice.text}</Callout>
        )}
      </div>
    </div>
  );
}
