"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button, Callout, Select, TextButton, TextField } from "../../components/mds";
import { SEARCH_TEAMS } from "../../lib/screen-identity";
import type { SearchTeam } from "../../lib/types";
import type { ImportReview } from "./mcp-import";
import type { RestCancelReview } from "./rest-cancel";
import styles from "./McpImportPanel.module.css";

export function McpImportPanel() {
  const [team, setTeam] = useState<SearchTeam>("앱");
  const [password, setPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [file, setFile] = useState<File>();
  const [review, setReview] = useState<ImportReview>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cancelReview, setCancelReview] = useState<RestCancelReview>();
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [cancelMessage, setCancelMessage] = useState("");
  const locked = useRef(false);
  const reset = () => { setReview(undefined); setConfirmed(false); setMessage(""); setCancelReview(undefined); setCancelConfirmed(false); setCancelMessage(""); };
  async function executeCancel(cancel: boolean) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setCancelMessage("");
    try {
      if (cancel && (!cancelReview?.canCancel || !cancelConfirmed)) throw new Error("취소 대상 확인이 필요합니다.");
      const response = await fetch("/api/admin/mcp-import", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", "x-team-password": password, "x-mcp-admin-password": adminPassword },
        body: JSON.stringify(cancel ? { action: "cancel-rest", team, id: cancelReview!.id, confirmed: true } : { action: "cancel-review", team }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "취소 상태를 처리하지 못했습니다.");
      setCancelConfirmed(false);
      if (cancel) {
        setCancelReview(undefined); setReview(undefined); setConfirmed(false); setMessage("");
        setCancelMessage("REST 작업을 백업 후 취소했습니다. 운영 인덱스는 그대로입니다. 위에서 MCP JSON을 선택하고 검토하기를 눌러 주세요.");
      } else setCancelReview(data);
    } catch (error) {
      setCancelMessage(error instanceof Error && !(error instanceof TypeError) ? error.message : "요청을 완료하지 못했습니다. REST 작업 상태 확인 후 취소를 다시 실행해 주세요.");
    } finally { locked.current = false; setBusy(false); }
  }
  async function execute(publish: boolean) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage("");
    try {
      if (publish && (!review?.canPublish || !confirmed)) throw new Error("검토 내용 확인이 필요합니다.");
      if (!publish && (!file || file.size > 1_500_000)) throw new Error("1.5MB 이하의 TeamIndex JSON 파일을 선택해 주세요.");
      let index;
      if (!publish) {
        setReview(undefined); setConfirmed(false);
        try { index = JSON.parse(await file!.text()); } catch { throw new Error("파일이 올바른 JSON이 아닙니다."); }
      }
      const response = await fetch("/api/admin/mcp-import", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", "x-team-password": password, "x-mcp-admin-password": adminPassword },
        body: JSON.stringify(publish ? { action: "publish", team, id: review!.id, confirmed: true } : { action: "review", team, index }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "가져오기를 처리하지 못했습니다.");
      if (publish) { setReview(undefined); setConfirmed(false); setMessage(`새 화면 ${data.added}개 추가 완료 · 총 ${data.total}개. 반영 전 백업을 저장했습니다.`); }
      else setReview(data);
    } catch (error) {
      if (publish) { setReview(undefined); setConfirmed(false); }
      setMessage(error instanceof Error && error.message && !(error instanceof TypeError) ? error.message : "요청을 완료하지 못했습니다. 연결 상태를 확인해 주세요.");
    } finally { locked.current = false; setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void execute(false); }
  return <main className={styles.page}>
    <TextButton href="/search">검색으로 돌아가기</TextButton>
    <h1>MCP 인덱스 가져오기 · 관리자 전용</h1>
    <Callout>기존 화면은 유지하고 새 화면만 추가합니다. Figma·Gemini를 호출하지 않습니다. 관리자 인증 전에는 인덱스를 읽거나 업로드를 저장하지 않습니다.</Callout>
    <form onSubmit={submit} className={styles.form}>
      <TextField label="팀 공용 비밀번호" type="password" autoComplete="off" value={password} disabled={busy} required onChange={e => { reset(); setPassword(e.target.value); }} />
      <TextField label="가져오기 관리자 비밀번호" type="password" autoComplete="off" value={adminPassword} disabled={busy} required onChange={e => { reset(); setAdminPassword(e.target.value); }} />
      <fieldset disabled={busy} className={styles.selectField}><Select label="대상 팀" value={team} options={SEARCH_TEAMS.map(t => ({ value: t, label: t }))} onChange={v => { if (locked.current) return; reset(); setTeam(v as SearchTeam); }} /></fieldset>
      <TextField label="MCP TeamIndex JSON (1.5MB 이하)" type="file" accept="application/json,.json" disabled={busy} onChange={e => { reset(); setFile(e.target.files?.[0]); }} />
      <Button type="submit" disabled={busy || !file || !password || !adminPassword}>{busy ? "처리 중…" : "검토하기 (운영 인덱스 변경 없음)"}</Button>
    </form>
    <Callout>컴포넌트·토큰의 빈 배열은 미수집일 수 있습니다. 일부 화면을 가져오는 작업이며 파일 전체 동기화 완료로 기록하지 않습니다. 수집 당시 숨겨진 레이어 제외 및 근거의 정확성을 확인한 JSON만 사용하세요.</Callout>
    {message && <Callout>{message}</Callout>}
    {review && <section className={styles.review}>
      <h2>반영 전 검토</h2>
      <dl className={styles.facts}>
        <dt>기존 화면</dt><dd>{review.existing}개</dd><dt>새 화면</dt><dd>{review.additions}개</dd>
        <dt>동일 내용 중복</dt><dd>{review.duplicates}개</dd><dt>충돌</dt><dd>{review.conflicts.length}개</dd>
        <dt>거부</dt><dd>{review.rejected.length}개</dd><dt>기존 삭제 / 변경</dt><dd>{review.deleted} / {review.changed}개</dd>
        <dt>APP 정답 프레임 · 업로드</dt><dd>{review.targetInUpload ? "포함" : "미포함"}</dd>
        <dt>APP 정답 프레임 · 병합 후</dt><dd>{review.targetInMerged ? "포함" : "미포함"}</dd>
      </dl>
      {!!(review.conflicts.length + review.rejected.length) && <ul className={styles.issues}>{[...review.conflicts, ...review.rejected].map((item, i) => <li key={i}>화면 {item.row + 1}: {item.reason}</li>)}</ul>}
      <p>검토는 15분간 유효합니다. 운영 데이터가 변경되면 다시 검토해야 합니다.</p>
      <label><input type="checkbox" checked={confirmed} disabled={busy || !review.canPublish} onChange={e => setConfirmed(e.target.checked)} /> 기존 화면 보존, 부분 수집 범위, 근거 및 미수집 정보를 확인했으며 운영 반영에 동의합니다.</label>
      <Button variant="danger" disabled={busy || !confirmed || !review.canPublish} onClick={() => void execute(true)}>운영 인덱스에 새 화면 추가</Button>
    </section>}
    <section className={styles.review}>
      <h2>남아 있는 REST 동기화 정리</h2>
      <p>MCP 가져오기가 REST 작업 때문에 막힐 때만 사용하세요. 작업과 초안을 백업 후 취소하며 운영 화면·Figma 토큰·요청 제한은 보존합니다.</p>
      <Button disabled={busy || !password || !adminPassword} onClick={() => void executeCancel(false)}>REST 작업 상태 확인 (취소 전 검토)</Button>
      {cancelMessage && <Callout>{cancelMessage}</Callout>}
      {cancelReview && <>
        <dl className={styles.facts}>
          <dt>선택한 팀</dt><dd>{cancelReview.team}</dd><dt>운영 화면 · 취소 후 유지</dt><dd>{cancelReview.existingScreens}개</dd>
          <dt>REST 진행 상태</dt><dd>{cancelReview.job ? `${cancelReview.job.done}/${cancelReview.job.total} 파일` : "작업 없음"}</dd>
          <dt>반영 대기 REST 초안</dt><dd>{cancelReview.draftScreens !== undefined ? `${cancelReview.draftScreens}개 화면` : "없음"}</dd>
        </dl>
        {cancelReview.job && <ul className={styles.issues}>{cancelReview.job.files.map((f, i) => <li key={i}>{f.name} · {f.status} · {f.screens}개</li>)}</ul>}
        <details><summary>백업·취소 대상 {cancelReview.targets.length}개</summary><ul className={styles.issues}>{cancelReview.targets.map(t => <li key={t.key}>{t.kind}: {t.key}</li>)}</ul></details>
        {cancelReview.resuming ? <Callout>이전 취소의 정리가 남아 있습니다. 백업을 재사용해 남은 정리만 재시도합니다.</Callout>
          : <p>검토는 15분간 유효합니다. 작업이나 운영 데이터가 바뀌면 다시 확인해야 합니다.</p>}
        {!cancelReview.canCancel && <Callout>취소할 REST 작업이나 초안이 없습니다. MCP JSON 검토를 진행할 수 있습니다.</Callout>}
        <label><input type="checkbox" checked={cancelConfirmed} disabled={busy || !cancelReview.canCancel} onChange={e => setCancelConfirmed(e.target.checked)} /> 위 작업·초안을 백업 후 취소하고 운영 인덱스는 유지하는 데 동의합니다.</label>
        <Button variant="danger" disabled={busy || !cancelConfirmed || !cancelReview.canCancel} onClick={() => void executeCancel(true)}>{cancelReview.resuming ? "백업된 REST 작업 취소 재시도" : "백업 후 REST 작업·초안 취소"}</Button>
      </>}
    </section>
  </main>;
}
