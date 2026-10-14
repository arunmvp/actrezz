import { NextResponse } from "next/server";
import { listPublicShorts, PUBLIC_PAGE_SIZE } from "@/lib/public-catalog";

export const revalidate = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  // OpenNext's server cache keeps the page data warm, while this native
  // Cloudflare edge-cache layer serves repeated browser/API requests without
  // entering the Worker (and therefore without opening a Supabase pooler
  // connection). It is deliberately only sixty seconds: publishing still
  // becomes visible promptly and there is no cache for admin routes.
  const cacheKeyUrl = new URL(url.origin + url.pathname);
  cacheKeyUrl.searchParams.set("page", String(page));
  const edgeCache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });
  const cached = await edgeCache?.match(cacheKey);
  if (cached) return cached;
  try {
    // Reuse the OpenNext/Supabase-backed shared cache used by the Shorts page.
    // Calling the uncached catalogue listing here made every Load more request
    // open a fresh pooler connection and repeat the same relation queries.
    const result = await listPublicShorts(page);
    const response = NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900" },
    });
    // The response body can only be consumed once, so cache a clone and send
    // the original back to the visitor.
    if (edgeCache) await edgeCache.put(cacheKey, response.clone());
    return response;
  } catch {
    return NextResponse.json({ items: [], page, totalPages: page, total: 0, error: "Shorts are temporarily unavailable." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
