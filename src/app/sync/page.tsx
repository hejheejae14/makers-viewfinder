"use client";

import { useState } from "react";

// 1-1 인덱스 동기화 화면입니다. 팀 비밀번호는 입력한 순간 서버로 보내 확인할 뿐 이 화면에 저장하지 않습니다.
// 디자인은 임시입니다. 공통 뼈대 담당자가 MDS에 맞춰 바꿉니다.

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
  const [team, setTeam] = useState<(typeof TEAMS)[number]>("앱");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");

  async function call(action: "status" | "start" | "continue") {
    const response = await fetch("/api/index-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-team-password": password },
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
      {message && (
        <p style={{ marginTop: 8 }} role="status">
          {message}
        </p>
      )}
    </main>
  );
}
