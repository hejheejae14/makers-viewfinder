import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 서버 API의 팀 비밀번호 확인입니다. 비밀번호 확인은 화면이 아니라 이곳(서버)에서 합니다.
 * 요청 헤더 x-team-password를 서버의 TEAM_PASSWORD 환경 변수와 비교합니다.
 */

const digest = (value: string) => createHash("sha256").update(value).digest();

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** 통과하면 undefined, 통과하지 못하면 그대로 돌려줄 오류 응답 */
export function authorize(request: Request): Response | undefined {
  const expected = process.env.TEAM_PASSWORD;
  // 서버에 비밀번호가 설정되어 있지 않으면 아무도 통과시키지 않는다. (열려 있는 상태로 두지 않는다.)
  if (!expected) return json({ error: "서버에 팀 비밀번호(TEAM_PASSWORD)가 설정되어 있지 않습니다." }, 503);

  const given = request.headers.get("x-team-password") ?? "";
  if (!timingSafeEqual(digest(given), digest(expected))) return json({ error: "팀 비밀번호가 맞지 않습니다." }, 401);
  return undefined;
}
