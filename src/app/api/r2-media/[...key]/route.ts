import { NextResponse } from "next/server";
import { createR2ReadUrl, r2Ready } from "@/lib/r2-presign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedPrefixes = new Set(["videos", "thumbnails", "actresses"]);

function contentType(key: string) {
  const lower = key.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

async function redirectToR2(context: { params: Promise<{ key: string[] }> }, method: "GET" | "HEAD") {
  const { key: parts } = await context.params;
  // Next has already decoded path parameters. Decoding twice corrupts percent characters.
  const key = parts.join("/");
  const [prefix] = parts;

  if (!r2Ready()) {
    return NextResponse.json({ error: "R2 is not configured." }, { status: 503 });
  }
  if (!prefix || !allowedPrefixes.has(prefix) || key.includes("..") || key.includes("\\")) {
    return NextResponse.json({ error: "Invalid media key." }, { status: 400 });
  }

  const signedUrl = createR2ReadUrl(key, key.startsWith("videos/") ? 3600 : 900, method);
  const response = NextResponse.redirect(signedUrl, 307);
  response.headers.set("Cache-Control", "private, max-age=60");
  response.headers.set("X-Robots-Tag", "noindex");
  response.headers.set("Content-Type", contentType(key));
  return response;
}

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  return redirectToR2(context, "GET");
}

export async function HEAD(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  return redirectToR2(context, "HEAD");
}
