import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "viewfinder-search-admin";
export const ADMIN_PATH = "/admin/search";
export const SESSION_SECONDS = 3600;

export function checkAdminPassword(value: string) {
  const expected = process.env.SEARCH_ADMIN_PASSWORD;
  return Boolean(expected && timingSafeEqual(hash(value), hash(expected)));
}

const hash = (value: string) => createHash("sha256").update(value).digest();
const sign = (value: string) => createHmac("sha256", process.env.SEARCH_ADMIN_PASSWORD ?? "").update(value).digest("hex");

export function createAdminSession() {
  const expires = String(Date.now() + SESSION_SECONDS * 1000);
  return `${expires}.${sign(expires)}`;
}

export function validAdminSession(token?: string) {
  if (!process.env.SEARCH_ADMIN_PASSWORD || !token) return false;
  const [expires, signature, extra] = token.split(".");
  if (extra || !expires || !signature || !Number.isFinite(Number(expires)) || Number(expires) <= Date.now()) return false;
  return timingSafeEqual(hash(signature), hash(sign(expires)));
}
