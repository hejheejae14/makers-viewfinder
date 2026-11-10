import assert from "node:assert/strict";
import test from "node:test";
import { checkAdminPassword, createAdminSession, validAdminSession } from "./admin-auth.ts";

test("관리자 세션은 설정된 비밀번호로 서명되어야 하고 변조·만료·설정 누락을 거부한다", () => {
  const previous = process.env.SEARCH_ADMIN_PASSWORD;
  try {
    process.env.SEARCH_ADMIN_PASSWORD = "test-only-admin-secret";
    assert.equal(checkAdminPassword("wrong"), false);
    assert.equal(checkAdminPassword("test-only-admin-secret"), true);
    const token = createAdminSession();
    assert.equal(validAdminSession(token), true);
    assert.equal(validAdminSession(`${token}tampered`), false);
    assert.equal(validAdminSession(`0.${token.split(".")[1]}`), false);
    process.env.SEARCH_ADMIN_PASSWORD = "rotated-secret";
    assert.equal(validAdminSession(token), false);
    delete process.env.SEARCH_ADMIN_PASSWORD;
    assert.equal(validAdminSession(token), false);
    assert.equal(checkAdminPassword(""), false);
  } finally {
    if (previous === undefined) delete process.env.SEARCH_ADMIN_PASSWORD;
    else process.env.SEARCH_ADMIN_PASSWORD = previous;
  }
});
