import test from "node:test";
import assert from "node:assert/strict";
import { describeGeminiError } from "./gemini-error.ts";

test("키 오류와 요청 형식 오류를 구분한다", () => {
  assert.match(describeGeminiError({ error: { status: "INVALID_ARGUMENT", message: "API key not valid" } }, ""), /전체 키를 다시 복사/);
  assert.match(describeGeminiError({ error: { message: 'Invalid JSON payload. Unknown name "field"' } }, ""), /일부 항목을 지원하지/);
});

test("오류에 반사된 키와 URL은 화면 설명에서 지운다", () => {
  const description = describeGeminiError({ error: { message: "bad secret-test-key AIzaOtherKey https://example.com?key=abc" } }, "secret-test-key");
  assert.doesNotMatch(description, /secret-test-key|AIzaOtherKey|https:\/\//);
});
