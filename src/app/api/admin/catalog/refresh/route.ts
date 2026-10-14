import { NextResponse } from "next/server";
import { invalidateCatalog, jsonError, noStore, requireAdmin } from "@/lib/admin/catalog-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

async function allowed(request: Request) {
  if (await requireAdmin(request)) return true;
  const token = bearerToken(request);
  const secret = process.env.ADMIN_REFRESH_SECRET || process.env.ADMIN_SESSION_SECRET;
  return Boolean(token && secret && token === secret);
}

export async function POST(request: Request) {
  if (!(await allowed(request))) return jsonError("Unauthorized.", 401);
  invalidateCatalog();
  return noStore(NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() }));
}

export async function GET(request: Request) {
  if (!(await allowed(request))) return jsonError("Unauthorized.", 401);
  return noStore(NextResponse.json({
    ok: true,
    endpoint: "POST /api/admin/catalog/refresh",
    note: "Use POST to refresh public catalogue, sitemap and notification caches.",
  }));
}
