import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "actrezz_admin_session";
const SESSION_SECONDS = 60 * 60 * 8;
const LOCAL_ADMIN_EMAIL = "admin@actrezz.local";
const LOCAL_ADMIN_PASSWORD = "actrezz-admin";
const LOCAL_ADMIN_SECRET = "actrezz-local-session-secret-change-before-launch";

function credentials() {
  const production = process.env.NODE_ENV === "production";
  return {
    email: process.env.ADMIN_EMAIL || (production ? "" : LOCAL_ADMIN_EMAIL),
    password: process.env.ADMIN_PASSWORD || (production ? "" : LOCAL_ADMIN_PASSWORD),
    secret: process.env.ADMIN_SESSION_SECRET || (production ? "" : LOCAL_ADMIN_SECRET),
  };
}

function adminCandidates() {
  const primary = credentials();
  if (process.env.NODE_ENV === "production") return [primary];
  const local = {
    email: LOCAL_ADMIN_EMAIL,
    password: LOCAL_ADMIN_PASSWORD,
    secret: primary.secret || LOCAL_ADMIN_SECRET,
  };
  return [primary, local].filter((item, index, items) => items.findIndex((other) => other.email === item.email) === index);
}

function signingSecret() {
  return credentials().secret || (process.env.NODE_ENV === "production" ? "" : LOCAL_ADMIN_SECRET);
}

function bytesToBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

async function hmac(value: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export function adminCredentialsReady() {
  const production = process.env.NODE_ENV === "production";
  const secret = signingSecret();
  if (production) {
    const { email, password } = credentials();
    return Boolean(email && password.length >= 12 && secret.length >= 32);
  }
  return Boolean(secret && adminCandidates().some((item) => item.email && item.password));
}

function constantEqual(left: string, right: string) {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function validAdminCredentials(email: string, password: string) {
  return adminCandidates().some((expected) => (
    Boolean(expected.email && expected.password && constantEqual(email, expected.email) && constantEqual(password, expected.password))
  ));
}

export async function createAdminSession(email: string) {
  const secret = signingSecret();
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");
  const payload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }))
  );
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function verifyAdminSession(token?: string) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  const secret = signingSecret();
  const emails = adminCandidates().map((item) => item.email).filter(Boolean);
  if (!payload || !signature || !secret || emails.length === 0) return false;

  try {
    const expected = await hmac(payload, secret);
    if (!constantEqual(signature, expected)) return false;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      exp?: number;
    };
    return emails.includes(session.email || "") && typeof session.exp === "number" && session.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
