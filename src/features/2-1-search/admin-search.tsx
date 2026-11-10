"use client";

import { useRef, useState, type FormEvent } from "react";
import type { SearchResponse, TeamIndex, TeamPage } from "../../lib/types";
import { createGeminiSearchAi, DEFAULT_GEMINI_MODEL } from "./gemini";
import { searchScreens, type SearchAi } from "./search";
import type { SearchCondition } from "./candidate-search";
import styles from "./admin-search.module.css";

const teams: TeamPage[] = ["앱", "플그", "크루", "공홈", "어드민"];

export default function AdminSearch({ authenticated }: { authenticated: boolean }) {
  const [password, setPassword] = useState("");
  const [teamPassword, setTeamPassword] = useState("");
  const [key, setKey] = useState("");
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [team, setTeam] = useState<TeamPage>("플그");
  const [source, setSource] = useState("mock");
  const [query, setQuery] = useState("커뮤니티 댓글 언급 기능 찾아줘");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("");
  const [busy, setBusy] = useState(false);
  const [conditions, setConditions] = useState<SearchCondition[]>([]);
  const [calls, setCalls] = useState(0);
  const [count, setCount] = useState(0);
  const [candidates, setCandidates] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function login(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch("/admin/search/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      window.location.reload();
    } catch (error) { setError(error instanceof Error ? error.message : "로그인에 실패했습니다."); }
    finally { setBusy(false); }
  }

  async function run(event: FormEvent) {
    event.preventDefault();
    const abort = new AbortController(); controller.current = abort;
    const started = performance.now();
    setBusy(true); setError(""); setResult(null); setConditions([]); setCalls(0); setCount(0); setCandidates(0); setElapsed(0);
    try {
      const base = createGeminiSearchAi(key, {
        model,
        onRequest: () => setCalls((value) => value + 1),
        onRetry: (attempt) => setPhase(`Gemini 일시 오류 · 잠시 후 자동 재시도 (${attempt}/2)`),
      });
      setPhase("인덱스 확인 중");
      const response = await fetch("/admin/search/index", {
        method: "POST", headers: { "Content-Type": "application/json", "x-team-password": teamPassword },
        body: JSON.stringify({ team, source }), signal: abort.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const index = body as TeamIndex; setCount(index.screens.length);
      const ai: SearchAi = {
        async interpret(input) {
          setPhase("Gemini가 검색 조건 해석 중");
          const interpretation = await base.interpret(input); setConditions(interpretation.conditions); return interpretation;
        },
        async judge(input) {
          setPhase("Gemini가 후보 판정 중"); setCandidates(input.candidates.length);
          return base.judge(input);
        },
      };
      setResult(await searchScreens({ query, team, screens: index.screens, ai, signal: abort.signal }));
      setPhase("검색 완료");
    } catch (error) {
      setPhase("검색 중단 · 아래 오류 이유를 확인해 주세요.");
      setError(controller.current?.signal.aborted ? "검색을 취소했습니다." : error instanceof Error ? error.message : "검색에 실패했습니다.");
    } finally { setElapsed((performance.now() - started) / 1000); setBusy(false); controller.current = null; }
  }

  return <main className={styles.page}>
    <header className={styles.header}><div><p>VIEWFINDER · ADMIN</p><h1>2-1 화면 검색 테스트</h1></div>{authenticated && <button disabled={busy} onClick={async () => { await fetch("/admin/search/session", { method: "DELETE" }); window.location.reload(); }}>로그아웃</button>}</header>
    <p className={styles.intro}>자연어로 기존 화면을 찾고, 실제 근거와 판정을 확인하세요.</p>
    {!authenticated ? <form className={styles.panel} onSubmit={login}><h2>관리자 확인</h2><p>관리자 전용 비밀번호로 접속할 수 있습니다. 인증은 1시간 동안 유지됩니다.</p><label>관리자 비밀번호<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" /></label><button disabled={busy}>{busy ? "확인 중…" : "관리자 접속"}</button></form> : <>
      <form className={styles.panel} onSubmit={run}>
        <h2>검색 설정</h2>
        <fieldset disabled={busy} className={styles.fields}>
          <div className={styles.row}><label>팀<select value={team} onChange={(e) => setTeam(e.target.value as TeamPage)}>{teams.map((team) => <option key={team}>{team}</option>)}</select></label><label>데이터<select value={source} onChange={(e) => setSource(e.target.value)}><option value="mock">테스트용 인덱스</option><option value="live">실제 동기화 인덱스</option></select></label></div>
          <p>{source === "mock" ? "개발용 가짜 화면 데이터입니다. Figma 링크는 실제 화면으로 연결되지 않습니다." : "선택한 팀의 마지막 동기화 결과를 검색합니다. 인덱스가 없다면 /sync에서 먼저 동기화하세요."}</p>
          <div className={styles.row}><label>팀 비밀번호<input required type="password" autoComplete="off" value={teamPassword} onChange={(e) => setTeamPassword(e.target.value)} /></label><label>개인 Gemini API 키<input required type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></label></div>
          <details><summary>Gemini 모델 설정</summary><label>모델 이름<input required value={model} onChange={(e) => setModel(e.target.value)} /></label></details>
          <label>찾고 싶은 화면<textarea required rows={3} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <div className={styles.row}>{["커뮤니티 댓글 언급 기능 찾아줘", "알림이 없는 모바일 화면 찾아줘", "항공권 결제 영수증 찾아줘"].map((example) => <button key={example} type="button" onClick={() => setQuery(example)}>{example}</button>)}</div>
          <p>Gemini 키는 이 화면의 메모리에만 유지됩니다. 검색어와 후보의 텍스트·컴포넌트 정보가 Google Gemini로 전송됩니다.</p>
          <button type="submit">화면 검색 실행</button>
        </fieldset>
        {busy && <button type="button" onClick={() => controller.current?.abort()}>검색 취소</button>}
      </form>
      <section className={styles.panel} aria-live="polite"><h2>실행 현황</h2><p>{phase || "검색을 실행하면 진행 상태가 여기에 표시됩니다."}</p><p>인덱스 {count}개 · 상세 후보 {candidates}개 · AI 호출 {calls}회{elapsed > 0 && ` · ${elapsed.toFixed(1)}초`}</p>
        {conditions.length > 0 && <details open><summary>AI가 해석한 필수 조건</summary><ul>{conditions.map((condition, index) => <li key={index}>{condition.label} — {condition.aliases.join(", ")}</li>)}</ul></details>}
      </section>
      {result && <section className={styles.panel}><h2>검색 결과</h2><p>“{result.query}” · {result.team}</p>
        {!result.results.some((item) => item.verdict === "정답 후보") && <p role="status">찾지 못함: 이 인덱스에서 모든 필수 조건을 확인한 화면이 없습니다.</p>}
        {(["정답 후보", "부분 일치"] as const).map((verdict) => <section key={verdict}><h3>{verdict} {result.results.filter((item) => item.verdict === verdict).length}개</h3>{result.results.filter((item) => item.verdict === verdict).map((item) => <article className={styles.result} key={item.screen.id}><p>{item.screen.teamPage} · {item.screen.section || "구역 정보 없음"}</p><h3>{item.screen.name}</h3><h4>판정 근거</h4><ul>{item.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>{item.unmetConditions && <><h4>확인하지 못한 조건</h4><ul>{item.unmetConditions.map((condition, i) => <li key={i}>{condition}</li>)}</ul></>}{source === "live" && <a href={item.screen.figmaUrl} target="_blank" rel="noreferrer">Figma 원본 열기 ↗</a>}<details><summary>인덱스의 직접 근거 확인</summary><p>{item.screen.texts.join(" / ")}</p><p>{item.screen.components.map((component) => `${component.name} ${component.variant || ""}`).join(" / ")}</p></details></article>)}</section>)}
        <p>이 판정은 저장된 인덱스 기준입니다. 원본 Figma의 현재 상태·최신성·개발 반영 여부는 확인하지 않습니다.</p>
      </section>}
    </>}
    {error && <p className={styles.panel} role="alert">{error}</p>}
  </main>;
}
