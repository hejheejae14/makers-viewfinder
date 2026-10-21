"use client";

import { useEffect, useState } from "react";

// 1-1 인덱스 동기화 화면입니다. 팀 비밀번호는 입력한 순간 서버로 보내 확인할 뿐 이 화면에 저장하지 않습니다.
// Figma 토큰은 동기화하는 사람의 개인 토큰이며, 이 브라우저(localStorage)에만 저장합니다. 서버에는 저장하지 않고
// 동기화 요청에 실어 보내 그 요청에서만 쓰입니다. (AGENTS.md: Figma 토큰도 브라우저에만 저장)
// 디자인은 임시입니다. 공통 뼈대 담당자가 MDS에 맞춰 바꿉니다.

const TOKEN_STORAGE_KEY = "viewfinder.figmaToken";
const TEAMS = ["앱", "플그", "크루", "공홈", "어드민"] as const;

interface Progress {
  done: number;
  total: number;
  finished: boolean;
}

interface Status {
  index: { syncedAt: string; screens: number; excluded: number } | null;
  pending: Progress | null;
}

export default function SyncPage() {
  const [password, setPassword] = useState("");
  const [figmaToken, setFigmaToken] = useState("");
  const [rememberToken, setRememberToken] = useState(true);
  const [team, setTeam] = useState<(typeof TEAMS)[number]>("앱");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");

  // 이 브라우저에 저장해 둔 토큰이 있으면 불러온다. (저장소를 쓸 수 없는 브라우저에서는 건너뜀)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
      // 서버 화면과 같은 첫 화면을 유지하려고, 브라우저 저장소의 값은 화면이 뜬 뒤에 한 번만 채운다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setFigmaToken(saved);
    } catch {}
  }, []);

  function changeToken(value: string) {
    setFigmaToken(value);
    try {
      if (rememberToken && value) localStorage.setItem(TOKEN_STORAGE_KEY, value);
    } catch {}
  }

  function changeRemember(checked: boolean) {
    setRememberToken(checked);
    try {
      if (checked && figmaToken) localStorage.setItem(TOKEN_STORAGE_KEY, figmaToken);
      if (!checked) localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {}
  }

  function clearToken() {
    setFigmaToken("");
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {}
  }

  async function call(action: "status" | "start" | "continue") {
    const response = await fetch("/api/index-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-team-password": password,
        ...(action === "status" ? {} : { "x-figma-token": figmaToken }),
      },
      body: JSON.stringify({ action, team }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `요청에 실패했습니다. (${response.status})`);
    return data;
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
          내 Figma 토큰
          <br />
          <input
            type="password"
            value={figmaToken}
            onChange={(event) => changeToken(event.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={rememberToken}
            onChange={(event) => changeRemember(event.target.checked)}
            disabled={busy}
          />{" "}
          이 브라우저에 저장 (서버에는 저장되지 않습니다)
        </label>
        <p style={{ fontSize: 13 }}>
          본인 Figma의 Settings → Security → Personal access tokens에서 만듭니다. 권한은 파일 내용 읽기와 디자인 시스템(컴포넌트,
          스타일) 읽기만 선택하세요. [PD] 문서 모음과 MDS 파일을 볼 수 있는 계정이어야 합니다.
        </p>
        <label>
          팀 페이지
          <br />
          <select value={team} onChange={(event) => setTeam(event.target.value as (typeof TEAMS)[number])} disabled={busy}>
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
          <button onClick={() => sync(true)} disabled={busy || !password || !figmaToken}>
            처음부터 동기화
          </button>
          {status?.pending && (
            <button onClick={() => sync(false)} disabled={busy || !password || !figmaToken}>
              이어서 동기화 ({status.pending.done}/{status.pending.total})
            </button>
          )}
          <button onClick={clearToken} disabled={busy || !figmaToken}>
            내 토큰 지우기
          </button>
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
      {message && (
        <p style={{ marginTop: 8 }} role="status">
          {message}
        </p>
      )}
    </main>
  );
}
