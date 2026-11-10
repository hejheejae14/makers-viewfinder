"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * 이 브라우저에 저장한 첫 진입 설정입니다. (1-2에서 저장하고, 검색 화면과 동기화 화면이 읽는다)
 * 팀 비밀번호와 개인 AI API 키는 이 브라우저(localStorage)에만 두고, 서버·로그로 보내지 않습니다.
 * 비밀번호는 요청 때마다 헤더로 서버에 보내 서버가 확인합니다.
 */

export interface Session {
  password: string;
  apiKey: string;
}

const STORAGE_KEY = "viewfinder.session";
const CHANGE_EVENT = "viewfinder-session-change";

/** 훅이 아니라 한 번만 읽는 용도(입력칸의 처음 값 등). 브라우저에서만 부른다. */
export function readSession(): Session | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Session> | null;
    return parsed?.password && parsed.apiKey ? { password: parsed.password, apiKey: parsed.apiKey } : null;
  } catch {
    return null;
  }
}

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** undefined: 아직 브라우저에서 읽기 전 / null: 저장된 설정 없음 / Session: 저장된 설정 */
export function useSession(): Session | null | undefined {
  const raw = useSyncExternalStore(subscribe, read, () => undefined);
  return useMemo(() => {
    if (raw === undefined) return undefined;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<Session>;
      return parsed.password && parsed.apiKey ? { password: parsed.password, apiKey: parsed.apiKey } : null;
    } catch {
      return null;
    }
  }, [raw]);
}
