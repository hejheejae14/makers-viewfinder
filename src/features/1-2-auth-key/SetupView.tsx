"use client";

import { useState } from "react";
import { Button, Callout, Select, TextButton, TextField, TopNavigation, type SelectOption } from "@/components/mds";
import styles from "./SetupView.module.css";

// 1-2. 첫 진입 화면: 팀 비밀번호와 개인 AI API 키를 입력받는다.
// 지금은 화면 모양만 있다. 비밀번호 서버 확인, 키 브라우저 저장, 연결 확인 동작은 다음 작업에서 붙인다.
// (AGENTS.md: API 키는 브라우저에만 저장하고 서버·로그로 보내지 않는다)

const AI_SERVICES: SelectOption[] = [{ value: "gemini", label: "Google Gemini" }];
const API_KEY_GUIDE_URL = "https://aistudio.google.com/apikey";

export function SetupView() {
  const [password, setPassword] = useState("");
  const [aiService, setAiService] = useState<string | null>("gemini");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className={styles.page}>
      <TopNavigation
        title={<span className={styles.logo}>Viewfinder</span>}
        right={<span className={styles.tagline}>메이커스 디자인 탐색 도구</span>}
      />
      <main className={styles.body}>
        <form className={styles.card} onSubmit={(event) => event.preventDefault()}>
          <div className={styles.title}>
            <h1 className={styles.heading}>처음 오셨나요?</h1>
            <p className={styles.lead}>
              팀 비밀번호와 개인 AI API 키를 한 번만 입력하면, 다음부터는 바로 검색 화면으로 들어갑니다.
            </p>
          </div>

          <TextField
            variant="bold"
            label="팀 비밀번호"
            type="password"
            autoComplete="off"
            placeholder="팀 채널에서 공유된 비밀번호"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <Select
            label="AI 서비스"
            required
            options={AI_SERVICES}
            value={aiService}
            onChange={setAiService}
          />

          <div className={styles.apiKey}>
            <TextField
              variant="bold"
              label="개인 API 키"
              type="password"
              autoComplete="off"
              placeholder="발급받은 API 키를 붙여 넣어 주세요"
              required
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              helperText="키는 이 브라우저에만 저장되고 서버로 보내지 않습니다. 무료 등급은 보낸 내용이 서비스 개선에 쓰일 수 있습니다."
            />
            <TextButton href={API_KEY_GUIDE_URL}>키 발급 가이드</TextButton>
          </div>

          <div className={styles.actions}>
            <Button variant="secondary">연결 확인</Button>
            <Button variant="primary" type="submit">
              시작하기
            </Button>
          </div>

          <Callout tone="information">연결 확인 후 [연결됨] 상태가 여기에 표시됩니다.</Callout>
        </form>
      </main>
    </div>
  );
}
