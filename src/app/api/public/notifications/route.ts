import { NextResponse } from "next/server";
import { getPublicNotifications } from "@/lib/public-catalog";

export const revalidate = 60;

export async function GET() {
  try {
    return NextResponse.json({ items: await getPublicNotifications() }, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json({ items: [], error: "Notifications are temporarily unavailable." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
