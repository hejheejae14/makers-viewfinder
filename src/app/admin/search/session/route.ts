import { cookies } from "next/headers";
import { ADMIN_COOKIE, ADMIN_PATH, SESSION_SECONDS, checkAdminPassword, createAdminSession } from "@/features/2-1-search/admin-auth";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!process.env.SEARCH_ADMIN_PASSWORD) return Response.json({ error: "서버에 SEARCH_ADMIN_PASSWORD를 설정해 주세요." }, { status: 503 });
  if (typeof body?.password !== "string" || !checkAdminPassword(body.password)) {
    return Response.json({ error: "관리자 비밀번호가 맞지 않습니다." }, { status: 401 });
  }
  (await cookies()).set(ADMIN_COOKIE, createAdminSession(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: ADMIN_PATH, maxAge: SESSION_SECONDS,
  });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  (await cookies()).set(ADMIN_COOKIE, "", { path: ADMIN_PATH, maxAge: 0 });
  return Response.json({ ok: true });
}
