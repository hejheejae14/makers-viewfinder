"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/mds/Button";
import { Callout } from "@/components/mds/Callout";
import type { SearchResult } from "@/lib/types";
import {
  buildHandoffPrompt,
  getHandoffUrl,
  HANDOFF_ACTIONS,
  HANDOFF_PROVIDERS,
  type HandoffActionId,
  type HandoffProviderId,
} from "./handoff";
import styles from "./AiHandoff.module.css";

export function AiHandoff({ result }: { result: Pick<SearchResult, "screen" | "summary"> }) {
  const id = useId();
  const promptField = useRef<HTMLTextAreaElement>(null);
  const [actionId, setActionId] = useState<HandoffActionId>(HANDOFF_ACTIONS[0].id);
  const [feedback, setFeedback] = useState<{ prompt: string; message: string } | null>(null);
  const prompt = buildHandoffPrompt(actionId, result);
  const destinations = HANDOFF_PROVIDERS.map((provider) => ({
    ...provider,
    handoffUrl: getHandoffUrl(provider.id, prompt),
  }));

  async function copyPrompt(openedChat = false) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
    } catch {
      const field = promptField.current;
      if (field?.value === prompt) {
        field.focus();
        field.select();
        copied = document.execCommand("copy");
      }
    }
    const message = copied
      ? openedChat
        ? "프롬프트를 복사했어요. 새 채팅에 붙여넣어 주세요."
        : "프롬프트를 복사했어요."
      : "자동 복사에 실패했어요. 프롬프트를 선택해 직접 복사해 주세요.";
    setFeedback({ prompt, message });
  }

  function openChat(providerId: HandoffProviderId) {
    const destination = destinations.find(({ id }) => id === providerId);
    if (!destination) return;
    if (!destination.handoffUrl) void copyPrompt(true);
    window.open(destination.handoffUrl ?? destination.newChatUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className={styles.handoff} aria-labelledby={`${id}-heading`}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>다음 작업</p>
        <h2 id={`${id}-heading`}>AI로 이어서 하기</h2>
        <p>찾은 화면의 맥락을 담아 ChatGPT나 Claude에서 다음 작업을 시작해 보세요.</p>
      </div>

      <fieldset className={styles.actions}>
        <legend className={styles.step}><span aria-hidden="true">01</span> 다음에 할 작업</legend>
        <div className={styles.options}>
          {HANDOFF_ACTIONS.map((action) => (
            <label className={styles.option} key={action.id}>
              <input
                type="radio"
                name={`${id}-action`}
                value={action.id}
                checked={actionId === action.id}
                onChange={() => {
                  setActionId(action.id);
                  setFeedback(null);
                }}
              />
              <span>
                <strong>{action.label}</strong>
                <span className={styles.description}>{action.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.promptSection}>
        <div className={styles.promptHeader}>
          <label className={styles.step} htmlFor={`${id}-prompt`}>
            <span aria-hidden="true">02</span> 프롬프트 미리보기
          </label>
          <Button size="small" variant="secondary" onClick={() => void copyPrompt()}>
            프롬프트 복사
          </Button>
        </div>
        <textarea
          className={styles.prompt}
          id={`${id}-prompt`}
          ref={promptField}
          value={prompt}
          readOnly
          rows={9}
          spellCheck={false}
        />
        <p className={styles.feedback} role="status" aria-live="polite">
          {feedback?.prompt === prompt ? feedback.message : ""}
        </p>
      </div>

      <div className={styles.footer}>
        <Callout icon={false}>
          AI에서 원본 링크를 읽으려면 해당 서비스에 Figma 또는 Notion을 연결해 주세요.
          {destinations.some(({ handoffUrl }) => !handoffUrl) &&
            " 이 프롬프트는 길어서 새 채팅에 붙여넣어야 해요."}
        </Callout>
        <div className={styles.providers}>
          {destinations.map(({ id: providerId, label }) => (
            <Button
              className={styles.provider}
              key={providerId}
              variant={providerId === "chatgpt" ? "primary" : "secondary"}
              onClick={() => openChat(providerId)}
              suffixIcon={<span aria-hidden="true">↗</span>}
            >
              {label}에서 열기
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
