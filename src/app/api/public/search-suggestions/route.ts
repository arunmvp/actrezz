import { NextResponse } from "next/server";
import { getSearchSuggestions } from "@/lib/public-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  return NextResponse.json(q.length < 2 ? { items: [] } : await getSearchSuggestions(q), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
