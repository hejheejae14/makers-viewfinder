"use client";

import { useState } from "react";

// 1-1 인덱스 동기화 화면입니다. 팀 비밀번호는 입력한 순간 서버로 보내 확인할 뿐 이 화면에 저장하지 않습니다.
// Figma 토큰은 팀 공용 읽기 전용 토큰 하나를 아래 "팀 공용 Figma 토큰" 구역에서 등록합니다. 등록한 토큰은 서버(Redis)에 보관되며
// 동기화와 화면 이미지가 함께 씁니다. 이 화면에는 값을 남기지 않고 서버도 값을 다시 돌려주지 않습니다. (팀 합의 필요)
// 디자인은 임시입니다. 공통 뼈대 담당자가 MDS에 맞춰 바꿉니다.

const TEAMS = ["앱", "플그", "크루", "공홈", "어드민"] as const;

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

export default function SyncPage() {
  const [password, setPassword] = useState("");
  const [team, setTeam] = useState<(typeof TEAMS)[number]>("앱");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [sharedToken, setSharedToken] = useState("");
  const [tokenStatus, setTokenStatus] = useState<{ configured: boolean; savedAt: string | null } | null>(null);
  const [tokenMessage, setTokenMessage] = useState("");

  async function call(action: "status" | "start" | "continue") {
    const response = await fetch("/api/index-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-team-password": password,
      },
      body: JSON.stringify({ action, team }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `요청에 실패했습니다. (${response.status})`);
    return data;
  }

  // 팀 페이지를 바꾸면 이전 팀의 진행 상황과 인덱스 정보가 남아 있지 않도록 지운다.
  function changeTeam(next: (typeof TEAMS)[number]) {
    setTeam(next);
    setStatus(null);
    setProgress(null);
    setMessage("");
  }

  async function refreshStatus() {
    setStatus((await call("status")) as Status);
  }

  async function sync(restart: boolean) {
    setBusy(true);
    setMessage("");
    try {
      if (restart) setProgress((await call("start")) as Progress);
      // 서버는 한 번에 시간 예산만큼만 읽으므로, 끝날 때까지 반복해서 부른다.
      for (;;) {
        const next = (await call("continue")) as Progress;
        setProgress(next);
        if (next.finished) break;
      }
      setMessage("동기화가 끝났습니다.");
      await refreshStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 났습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 팀 공용 Figma 토큰. 입력칸의 값은 등록하는 순간 서버로 보내고, 이 화면에는 남기지 않는다.
  async function callFigmaToken(action: "status" | "set" | "clear") {
    setTokenMessage("");
    try {
      const response = await fetch("/api/figma-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-team-password": password },
        body: JSON.stringify({ action, ...(action === "set" ? { token: sharedToken } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `요청에 실패했습니다. (${response.status})`);
      setTokenStatus(data as { configured: boolean; savedAt: string | null });
      if (action === "set") {
        setSharedToken("");
        setTokenMessage("공용 토큰을 등록했습니다.");
      }
      if (action === "clear") setTokenMessage("공용 토큰을 지웠습니다.");
    } catch (error) {
      setTokenMessage(error instanceof Error ? error.message : "알 수 없는 오류가 났습니다.");
    }
  }

  async function check() {
    setMessage("");
    try {
      await refreshStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 났습니다.");
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <h1>인덱스 동기화</h1>
      <p style={{ marginTop: 8 }}>
        Figma의 팀 페이지를 읽어 검색 인덱스를 새로 만듭니다. Figma는 읽기만 하며, 끝나기 전에는 이전 인덱스가 그대로 쓰입니다.
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          팀 비밀번호
          <br />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <label>
          팀 페이지
          <br />
          <select value={team} onChange={(event) => changeTeam(event.target.value as (typeof TEAMS)[number])} disabled={busy}>
            {TEAMS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={check} disabled={busy || !password}>
            상태 확인
          </button>
          <button onClick={() => sync(true)} disabled={busy || !password}>
            처음부터 동기화
          </button>
          {status?.pending && (
            <button onClick={() => sync(false)} disabled={busy || !password}>
              이어서 동기화 ({status.pending.done}/{status.pending.total})
            </button>
          )}
        </div>
      </div>

      {progress && (
        <p style={{ marginTop: 16 }} aria-live="polite">
          진행: {progress.done} / {progress.total} 구역{progress.finished ? " (완료)" : busy ? " …" : ""}
        </p>
      )}
      {status && (
        <p style={{ marginTop: 8 }}>
          현재 인덱스:{" "}
          {status.index
            ? `화면 ${status.index.screens}개, 제외한 프레임 ${status.index.excluded}개 (동기화 ${new Date(status.index.syncedAt).toLocaleString("ko-KR")})`
            : "아직 동기화한 적이 없습니다."}
        </p>
      )}
      {status?.index && status.index.excluded > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary>제외한 프레임 이유별 보기</summary>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            {Object.entries(status.index.excludedByReason).map(([reason, { count, examples }]) => (
              <li key={reason}>
                {reason}: {count}개 (예: {examples.join(", ")})
              </li>
            ))}
          </ul>
        </details>
      )}
      {message && (
        <p style={{ marginTop: 8 }} role="status">
          {message}
        </p>
      )}

      <section style={{ marginTop: 32, display: "grid", gap: 12 }}>
        <h2>팀 공용 Figma 토큰</h2>
        <p style={{ fontSize: 13 }}>
          동기화와 검색 결과의 화면 이미지가 함께 쓰는 읽기 전용 Figma 토큰입니다. 한 번 등록하면 팀원은 토큰 없이 씁니다.
          Figma의 Settings → Security → Personal access tokens에서 만들고, 권한은 파일 내용 읽기와 디자인 시스템(컴포넌트, 스타일)
          읽기만 선택하세요. [PD] 문서 모음과 MDS 파일을 볼 수 있는 계정이어야 합니다. 등록한 토큰은 서버에 보관되며 화면이나 응답에
          다시 보이지 않습니다. 토큰이 만료되면 여기서 새 토큰으로 바꿔 주세요.
        </p>
        <label>
          공용 Figma 토큰
          <br />
          <input
            type="password"
            value={sharedToken}
            onChange={(event) => setSharedToken(event.target.value)}
            autoComplete="off"
          />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => callFigmaToken("status")} disabled={!password}>
            등록 상태 확인
          </button>
          <button onClick={() => callFigmaToken("set")} disabled={!password || !sharedToken}>
            공용 토큰 등록·교체
          </button>
          <button onClick={() => callFigmaToken("clear")} disabled={!password || !tokenStatus?.configured}>
            공용 토큰 지우기
          </button>
        </div>
        {tokenStatus && (
          <p>
            {tokenStatus.configured
              ? `등록됨 (${tokenStatus.savedAt ? new Date(tokenStatus.savedAt).toLocaleString("ko-KR") : "날짜 알 수 없음"})`
              : "등록된 공용 토큰이 없습니다."}
          </p>
        )}
        {tokenMessage && <p role="status">{tokenMessage}</p>}
      </section>
    </main>
  );
}
