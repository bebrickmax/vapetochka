import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Вход в админку по паролю из ADMIN_PASSWORD.
 * Сессия — подписанная cookie (HttpOnly, Secure, SameSite=Strict) на 30 дней:
 * «срок|подпись», подпись — HMAC-SHA256 от срока на ключе из пароля.
 * Сменили пароль — все старые сессии становятся недействительными.
 */

export const SESSION_COOKIE = "vt_admin";
const SESSION_DAYS = 30;

function secret(): string | null {
  const password = process.env.ADMIN_PASSWORD ?? "";
  return password.length >= 4 ? password : null;
}

export const isAdminConfigured = () => secret() !== null;

function sign(value: string, key: string): string {
  return createHmac("sha256", `vt-admin:${key}`).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): boolean {
  const key = secret();
  if (!key) return false;
  // Сравниваем подписи одинаковой длины — время не зависит от совпавших символов.
  return safeEqual(sign(input, key), sign(key, key));
}

export function createSessionToken(now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error("ADMIN_PASSWORD не задан");
  const expires = String(now + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return `${expires}.${sign(expires, key)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  const key = secret();
  if (!key || !token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires) || Number(expires) < now) return false;
  return safeEqual(signature, sign(expires, key));
}

function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export const isAuthorized = (request: Request) => verifySessionToken(cookieValue(request, SESSION_COOKIE));

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`;
}

export const clearedSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
