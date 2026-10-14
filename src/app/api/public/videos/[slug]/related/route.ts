import { NextResponse } from "next/server";
import { getRelatedVideosForSlug } from "@/lib/public-catalog";

export const revalidate = 60;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const offset = Math.max(0, Math.min(144, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
  // Keep each public related-results batch at the Cloudflare edge. The ranked
  // candidate set is separately shared by the catalogue layer, so a new
  // offset does not repeat the full relation-ranking work.
  const cacheKeyUrl = new URL(url.origin + url.pathname);
  cacheKeyUrl.searchParams.set("offset", String(offset));
  const edgeCache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });
  const cached = await edgeCache?.match(cacheKey);
  if (cached) return cached;
  const result = await getRelatedVideosForSlug(slug, 12, offset);
  if (!result) return NextResponse.json({ items: [], hasMore: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  // This is a data endpoint, not a crawlable page. The watch URL remains the
  // single canonical document; first related results stay server-rendered.
  const response = NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900", "X-Robots-Tag": "noindex" },
  });
  if (edgeCache) await edgeCache.put(cacheKey, response.clone());
  return response;
}
