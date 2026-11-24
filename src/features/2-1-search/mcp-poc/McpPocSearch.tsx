"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Callout, Dialog, Select, TextButton, TextField } from "@/components/mds";
import { SetupForm } from "@/features/1-2-auth-key/SetupView";
import { useSession } from "@/lib/session";
import { screenIdentity } from "@/lib/screen-identity";
import type { SearchResponse, TeamIndex } from "@/lib/types";
import { ResultsPane } from "@/features/0-common-shell/ResultsPane";
import { ResultDetail } from "@/features/0-common-shell/ResultDetail";
import { createGeminiSearchAi, DEFAULT_GEMINI_MODEL } from "../gemini";
import { runSearch, type SearchTrace } from "../search-pipeline";
import { GeminiSearchError, type GeminiDiagnostic } from "../gemini-error";
import styles from "./McpPocSearch.module.css";
import { runConnectionDiagnostic, type ConnectionDiagnosticResult } from "./connection-diagnostic";
import type { JudgePayloadStats } from "../judge-payload";

const TARGET = "14330:42211";
const QUERY = "앱서비스 홈 화면에서 콘텐츠가 없을 때 표시되는 Empty View";

// 검색 원문·후보 텍스트·모델 응답은 진단 상태에 복사하지 않는다.
function summarizeTrace(trace: SearchTrace) {
  return { stage: trace.stage, totalScreens: trace.totalScreens, scopedScreens: trace.scopedScreens,
    candidateLimit: trace.candidateLimit, candidateCount: trace.candidates?.length ?? 0,
    targetCandidateIncluded: trace.candidates?.some(c => c.screen.id === TARGET) ?? false,
    conditionCount: trace.interpretation?.conditions.length ?? 0,
    judgementCount: trace.judgements?.length ?? 0,
    verifiedCount: trace.verification?.length ?? 0,
  };
}

/** 기존 검색·BYOK 어댑터를 재사용하며 인덱스 읽기만 로컬 PoC로 분리한다. */
export function McpPocSearch() {
  const session = useSession();
  const [query, setQuery] = useState(QUERY);
  const [index, setIndex] = useState<TeamIndex>();
  const [response, setResponse] = useState<SearchResponse>();
  const [trace, setTrace] = useState<ReturnType<typeof summarizeTrace>>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [calls, setCalls] = useState(0);
  const [payloadStats, setPayloadStats] = useState<JudgePayloadStats>();
  const [searchWarnings, setSearchWarnings] = useState<string[]>([]);
  const [diagnostic, setDiagnostic] = useState<GeminiDiagnostic>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionResults, setConnectionResults] = useState<ConnectionDiagnosticResult[]>([]);
  const [connectionStarted, setConnectionStarted] = useState(false);
  const connectionOnce = useRef(false);
  const request = useRef<AbortController | null>(null);
  const locked = useRef(false);
  useEffect(() => () => request.current?.abort(), []);
  const results = response?.results ?? [];
  const selected = results.find(r => screenIdentity(r.screen) === selectedId);

  async function load(signal: AbortSignal) {
    const result = await fetch("/api/dev/mcp-index", {
      method: "POST", headers: { "Content-Type": "application/json", "x-team-password": session!.password },
      body: JSON.stringify({ team: "앱" }), cache: "no-store", signal,
    });
    const body = await result.json();
    if (!result.ok) throw new Error(body.error ?? "임시 인덱스를 읽지 못했습니다.");
    setIndex(body as TeamIndex);
    return body as TeamIndex;
  }

  async function execute(search: boolean) {
    if (!session || locked.current) return;
    locked.current = true; setBusy(true); setMessage("");
    setResponse(undefined); setTrace(undefined); setSelectedId(null); setCalls(0); setDiagnostic(undefined);
    setSearchWarnings([]);
    setPayloadStats(undefined);
    const controller = new AbortController(); request.current = controller;
    try {
      const temporary = await load(controller.signal);
      if (!search) { setMessage(`임시 인덱스 ${temporary.screens.length}개 확인 · Gemini 호출 0회`); return; }
      const ai = createGeminiSearchAi(session.apiKey, { onRequest: () => setCalls(n => n + 1),
        onPayload: stats => setPayloadStats(stats),
        onRetry: (_stage, delayMs, model) => setMessage(`Gemini의 503 일시 오류로 약 ${Math.ceil(delayMs / 1000)}초 후 ${model} 모델로 한 번 재시도합니다. 추가 사용량이 발생할 수 있어요.`) });
      const result = await runSearch({ query, team: "앱", index: temporary, signal: controller.signal,
        ai, onTrace: value => { setTrace(summarizeTrace(value)); setSearchWarnings(value.interpretation?.warnings ?? []); },
      });
      setResponse(result);
      setMessage("");
      setSelectedId(result.results[0] ? screenIdentity(result.results[0].screen) : null);
      setDetailOpen(true);
    } catch (error) {
      if (error instanceof GeminiSearchError && !controller.signal.aborted) setDiagnostic({ ...error.diagnostic });
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "검색 실패");
    } finally { locked.current = false; setBusy(false); }
  }

  async function diagnoseConnection(mode: "all" | "D-only") {
    if (!session || locked.current || connectionOnce.current) return;
    connectionOnce.current = true; locked.current = true;
    setConnectionStarted(true); setBusy(true);
    const controller = new AbortController(); request.current = controller;
    try {
      await runConnectionDiagnostic({ apiKey: session.apiKey, signal: controller.signal, mode,
        onResult: result => { if (!controller.signal.aborted) setConnectionResults(current => [...current, result]); },
      });
    } catch {
      setMessage("연결 진단을 시작하지 못했습니다. 개발 환경과 개인 키 설정을 확인해 주세요.");
    } finally { locked.current = false; setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void execute(true); }
  return <main className={styles.page}>
    <h1>MCP 임시 인덱스 검색 검증</h1>
    <Callout>로컬 테스트 · APP 파일 1개에서 수집한 화면 4개입니다. 운영 인덱스와 분리되어 있습니다.</Callout>
    <p aria-live="polite">개인 Gemini API 키: {session === undefined ? "확인 중" : session?.apiKey ? "저장됨" : "미설정"}</p>
    <p>저장 여부만 표시합니다. 현재 모델로 실제 검색할 수 있는지는 별도 확인이 필요합니다.</p>
    <TextButton disabled={busy} onClick={() => setSettingsOpen(true)}>개인 키 등록·변경</TextButton>
    <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="개인 Gemini 키 및 팀 설정">
      <p>키는 마스킹해 표시합니다. 저장 시 기존 방식으로 팀 비밀번호와 Gemini 모델 목록 조회를 확인합니다. 페이지와 검색어는 유지됩니다.</p>
      <SetupForm variant="modal" onDone={() => setSettingsOpen(false)} />
    </Dialog>
    <details className={styles.form}>
      <summary>개발 전용 요청 실험 — A~D / D 전용 (검색과 별도)</summary>
    <section aria-label="Gemini 연결 진단" className={styles.form}>
      <h2>Gemini API 연결 진단 (A~D)</h2>
      <Callout>일반 검색과 MCP 검색은 모두 JSON 모드이며 responseJsonSchema를 전송하지 않습니다.
        아래 C·D는 서버 스키마의 수용 여부를 비교하는 별도 실험입니다. 실제 검색 확인은 아래의 Gemini 검색 실행 버튼을 사용하세요.</Callout>
      <Callout>직접 버튼을 눌렀을 때만 현재 모델 {DEFAULT_GEMINI_MODEL}로 실행합니다. A 최소 생성 → B JSON 모드 → C 단순 스키마 → D 현재 interpret 스키마 순서로 최대 4회 요청하며 첫 실패에서 중단합니다.
        자동 재시도는 없으며 이 페이지에서 한 번만 실행할 수 있습니다. 각 요청의 출력 한도는 1,024토큰입니다.
        무료 한도 내 무료이며, 유료 예시로 전체 입력 5천·출력 4,096토큰이면 약 $0.012입니다. 실제 비용은 사용량에 따라 달라집니다.
        고정 시험 입력만 보내며 검색어와 Figma 인덱스는 보내지 않습니다.</Callout>
      <Callout>A~C 성공을 확인했다면 아래 D 전용 버튼을 사용하세요. 변경된 전송 스키마로 D만 최대 1회 호출합니다.
        유료 예시 입력 2천·출력 1,024토큰은 약 $0.0032이며 실제 비용은 사용량에 따릅니다. 브라우저의 엄격한 응답 검증은 유지됩니다.</Callout>
      <Button type="button" disabled={!session || busy || connectionStarted} onClick={() => void diagnoseConnection("D-only")}>변경된 D 단계만 검증 (최대 1회)</Button>
      <Button type="button" disabled={!session || busy || connectionStarted} onClick={() => void diagnoseConnection("all")}>Gemini API 연결 진단 (A~D)</Button>
      {connectionStarted && <p aria-live="polite">연결 진단 요청 결과 {connectionResults.length}개. 재실행하려면 페이지를 새로 열어야 하며 추가 사용량이 발생합니다.</p>}
      {!!connectionResults.length && <table>
        <caption>연결 진단 결과 — 성공은 정상 종료와 단계별 응답 형식 통과를 뜻합니다.</caption>
        <thead><tr><th>단계</th><th>HTTP</th><th>성공 여부</th><th>Google 코드</th><th>Google 상태</th><th>요청 필드</th></tr></thead>
        <tbody>{connectionResults.map(result => <tr key={result.stage}>
          <td>{result.stage}</td><td>{result.httpStatus ?? "응답 없음"}</td><td>{result.success ? "성공" : "실패 · 중단"}</td>
          <td>{result.googleCode ?? "확인 불가"}</td><td>{result.googleStatus ?? "허용된 정보 없음"}</td><td>{result.fields.join(", ") || "허용된 정보 없음"}</td>
        </tr>)}</tbody>
      </table>}
    </section>
    </details>
    <Callout>검색 실행 시 {DEFAULT_GEMINI_MODEL} 기본 2회(해석 1회 + 판정 1회), 503일 때만 대체 Gemini 모델로 전환하며 단계별 1회 재시도로 최대 4회 요청합니다. 추가 사용량이 발생할 수 있어요.
      무료 한도 내 무료이며 유료 예시로 입력 1만 + 출력 2천 토큰은 약 $0.008입니다. 실제 비용은 사용량에 따라 달라집니다.
      검색어와 4개 후보의 텍스트가 Google로 전송됩니다. <a href="https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite" target="_blank" rel="noreferrer">가격표</a></Callout>
    <form className={styles.form} onSubmit={submit}>
      <Select label="팀" value="앱" options={[{ value: "앱", label: "앱 (PoC)" }]} onChange={() => {}} />
      <TextField label="찾고 싶은 화면" value={query} onChange={event => setQuery(event.target.value)} />
      <Button type="button" disabled={!session || busy} onClick={() => void execute(false)}>임시 인덱스 확인 (AI 호출 없음)</Button>
      <Button type="submit" disabled={!session || busy || !query.trim()}>{busy ? "실행 중…" : "Gemini 검색 실행 (재시도 포함 최대 4회)"}</Button>
    </form>
    {session === null && <Callout>개인 키 등록·변경에서 팀 비밀번호와 개인 Gemini 키를 설정해 주세요. 설정을 열기만 하면 Gemini를 호출하지 않습니다.</Callout>}
    {message && <Callout>{message}</Callout>}
    {!!searchWarnings.length && <Callout>{searchWarnings.join(" ")}</Callout>}
    {diagnostic && <Callout tone="danger">
      실패 단계: {diagnostic.stage} · 유형: {diagnostic.kind} · HTTP: {diagnostic.httpStatus ?? "응답 없음"} ·
      finishReason: {diagnostic.finishReason ?? "확인 불가"} · 오류 필드: {diagnostic.fieldPath ?? "해당 없음"}
      {diagnostic.apiError && <p>
        Google 오류 코드: {diagnostic.apiError.code ?? "확인 불가"} · 상태: {diagnostic.apiError.status ?? "허용된 정보 없음"} ·
        사유: {diagnostic.apiError.reasons.join(", ") || "허용된 정보 없음"} ·
        요청 필드: {diagnostic.apiError.fields.join(", ") || "허용된 정보 없음"} · 오류 본문 판독: {diagnostic.apiError.bodyState}
      </p>}
    </Callout>}
    <p aria-live="polite">검색 실행 Gemini 요청 {calls}회 · 단계: {trace?.stage ?? "대기"}</p>
    {payloadStats && <p>판정 입력 JSON {payloadStats.inputChars.toLocaleString()}자 · 후보 {payloadStats.candidateCount}개 · 일부 정보 생략 후보 {payloadStats.limitedCandidates}개 · 생략 근거 {payloadStats.omittedEvidence}개. 문자 수는 토큰 수가 아닙니다.</p>}
    {index && <details><summary>실제 임시 인덱스: {index.screens.length}개</summary><ul>{index.screens.map(s => <li key={screenIdentity(s)}>{s.name} · {s.id} · {s.pageName}</li>)}</ul></details>}
    {response && <Callout>대상 {TARGET}: {results.some(r => r.screen.id === TARGET) ? `${results.findIndex(r => r.screen.id === TARGET) + 1}순위 · ${results.find(r => r.screen.id === TARGET)!.verdict}` : "최종 결과에 없음"}. 이는 실제 Gemini 응답이며 정답 노출을 강제하지 않습니다.</Callout>}
    {response && !results.length && <Callout>찾지 못함: 결과를 억지로 채우지 않았습니다. 아래 진단에서 후보 포함 여부와 판정을 확인해 주세요.</Callout>}
    <Callout>PoC에서 확인한 사실: 대상 홈의 인기글·최신 게시물 영역은 Empty이지만 프로필·행사 등 다른 콘텐츠는 존재합니다.
      아래 결과는 모델 판정입니다. 화면 전체 Empty로 단정하면 오탐으로 기록해 주세요. 컴포넌트·토큰은 이 임시 인덱스에서 미수집이며, 없다는 뜻이 아닙니다.</Callout>
    {!!results.length && <ResultsPane results={results} selectedId={selectedId} detailOpen={detailOpen}
      onSelect={id => { setSelectedId(id); setDetailOpen(true); }} onClose={() => setDetailOpen(false)}
      detail={selected && <ResultDetail result={selected} thumbnailLoading={false} thumbnailNote="이 테스트는 Figma REST API를 호출하지 않습니다. 원본 링크에서 화면을 확인해 주세요." />} />}
    {trace && <details><summary>검색 진단: 단계·개수·대상 후보 포함 여부 (원문 제외)</summary><pre className={styles.trace}>{JSON.stringify(trace, null, 2)}</pre></details>}
  </main>;
}
