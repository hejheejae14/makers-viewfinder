"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  Button,
  Select,
  TextButton,
  TextField,
  TopNavigation,
  type SelectOption,
} from "@/components/mds";
import { readSession, saveSession } from "@/lib/session";
import { verifyGeminiKey, verifyTeamPassword } from "./verify";
import styles from "./SetupView.module.css";

// 1-2. 팀 비밀번호와 개인 AI API 키를 입력받는다.
// 시작하기·저장: 팀 비밀번호는 서버에서, 개인 키는 Gemini에서 확인하고, 통과하면 이 브라우저에 저장한다.
// 같은 입력 양식(SetupForm)을 첫 진입 화면(SetupView)과 검색 화면의 설정 모달이 함께 쓴다.
// (AGENTS.md: API 키는 브라우저에만 저장하고 서버·로그로 보내지 않는다)

const AI_SERVICES: SelectOption[] = [
  { value: "gemini", label: "Google Gemini" },
];
const API_KEY_GUIDE_URL = "https://aistudio.google.com/apikey";

interface SetupFormProps {
  /** page: 첫 진입 화면의 카드 모양 / modal: 모달 안쪽(제목은 모달이 보여 준다) */
  variant?: "page" | "modal";
  /** 저장이 끝났을 때. page는 검색 화면으로 가고, modal은 모달을 닫는다. */
  onDone?: () => void;
}

export function SetupForm({ variant = "page", onDone }: SetupFormProps) {
  const isModal = variant === "modal";
  // 모달은 저장해 둔 값으로 미리 채운다. (모달은 브라우저에서만 그려지므로 저장소를 바로 읽어도 된다.)
  const [password, setPassword] = useState(() =>
    isModal ? (readSession()?.password ?? "") : "",
  );
  const [aiService, setAiService] = useState<string | null>("gemini");
  const [apiKey, setApiKey] = useState(() =>
    isModal ? (readSession()?.apiKey ?? "") : "",
  );
  const [busy, setBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const reason = (error: unknown) =>
    error instanceof Error ? error.message : "연결을 확인하지 못했어요.";

  // 비밀번호와 키를 차례로 확인한다. 어느 쪽이 틀렸는지 해당 입력칸에 이유를 보여 주고 false를 돌려준다.
  async function verify() {
    setBusy(true);
    setPasswordError(null);
    setApiKeyError(null);
    try {
      try {
        await verifyTeamPassword(password.trim());
      } catch (error) {
        setPasswordError(reason(error));
        return false;
      }
      try {
        await verifyGeminiKey(apiKey.trim());
      } catch (error) {
        setApiKeyError(reason(error));
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!(await verify())) return;
    saveSession({ password: password.trim(), apiKey: apiKey.trim() });
    onDone?.();
  }

  // 모달 배경(neutral/ghost)과 같은 색이면 입력칸이 안 보이므로, 모달에서는 더 어두운 default 칸을 쓴다.
  const fieldVariant = isModal ? "default" : "bold";
  const empty = !password.trim() || !apiKey.trim();

  return (
    <form
      className={isModal ? styles.modalForm : styles.card}
      onSubmit={submit}
    >
      {!isModal && (
        <div className={styles.title}>
          <h1 className={styles.heading}>처음 오셨나요?</h1>
          <p className={styles.lead}>
            팀 비밀번호와 개인 AI API 키를 한 번만 입력하면, 다음부터는 바로
            검색 화면으로 들어가요.
          </p>
        </div>
      )}

      <TextField
        variant={fieldVariant}
        label="팀 비밀번호"
        type="password"
        autoComplete="off"
        placeholder="팀 채널에서 공유된 비밀번호"
        required
        value={password}
        errorMessage={passwordError}
        onChange={(event) => {
          setPassword(event.target.value);
          setPasswordError(null);
        }}
      />

      <Select
        variant={fieldVariant}
        label="AI 서비스"
        required
        options={AI_SERVICES}
        value={aiService}
        onChange={setAiService}
      />

      <div className={styles.apiKey}>
        <TextField
          variant={fieldVariant}
          label="개인 API 키"
          // MDS 입력칸의 설명(description)은 제목 아래, 입력칸 위에 놓인다. 설정 모달에서는 두지 않는다.
          description={
            isModal
              ? undefined
              : "키는 이 브라우저에만 저장되고 서버로 보내지 않아요."
          }
          type="password"
          autoComplete="off"
          placeholder="발급받은 API 키를 붙여 넣어 주세요"
          required
          value={apiKey}
          errorMessage={apiKeyError}
          onChange={(event) => {
            setApiKey(event.target.value);
            setApiKeyError(null);
          }}
        />
        <TextButton href={API_KEY_GUIDE_URL}>키 발급 가이드</TextButton>
      </div>

      <div
        className={[styles.actions, isModal && styles.modalActions]
          .filter(Boolean)
          .join(" ")}
      >
        <Button variant="primary" type="submit" disabled={busy || empty}>
          {busy ? "확인하는 중…" : isModal ? "저장" : "시작하기"}
        </Button>
      </div>

      {/* 첫 진입 화면은 원래 디자인대로 버튼 아래, 모달은 버튼(Dialog 맨 아래) 위에 둔다. */}
    </form>
  );
}

export function SetupView() {
  const router = useRouter();

  return (
    <div className={styles.page}>
      <TopNavigation
        title={<span className={styles.logo}>Viewfinder</span>}
        right={
          <span className={styles.tagline}>메이커스 디자인 탐색 도구</span>
        }
      />
      <main className={styles.body}>
        <SetupForm onDone={() => router.push("/search")} />
      </main>
    </div>
  );
}
