/** 일반 검색과 개발용 연결 진단이 공유하는 설정. 키는 포함하지 않는다. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
// 기본 모델의 503에만 사용한다. https://aistudio.google.com/docs/models/gemini-3.1-flash-lite
export const FALLBACK_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const GEMINI_MODELS_API = "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_GENERATION_DEFAULTS = { temperature: 0.1 };
export const GEMINI_STORE = false;
