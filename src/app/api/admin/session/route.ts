import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCredentialsReady,
  createAdminSession,
  validAdminCredentials,
} from "@/lib/admin-auth";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 6;

function clientKey(request: Request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function POST(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return noStore(NextResponse.json({ error: "Invalid request origin." }, { status: 403 }));
  }
  const key = clientKey(request);
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.resetAt > now && current.count >= MAX_ATTEMPTS) {
    return noStore(NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(Math.ceil((current.resetAt - now) / 1000)) } }));
  }
  if (!adminCredentialsReady()) {
    return noStore(NextResponse.json({ error: "Admin credentials are not configured." }, { status: 503 }));
  }

  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase() || "";
  const password = body?.password || "";

  if (!validAdminCredentials(email, password)) {
    attempts.set(key, current && current.resetAt > now ? { ...current, count: current.count + 1 } : { count: 1, resetAt: now + WINDOW_MS });
    await new Promise((resolve) => setTimeout(resolve, 450));
    return noStore(NextResponse.json({ error: "Invalid email or password." }, { status: 401 }));
  }

  attempts.delete(key);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, await createAdminSession(email), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return noStore(response);
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return noStore(response);
}
