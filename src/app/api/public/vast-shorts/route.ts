import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return "https://actrezz.online";
  try {
    return new URL(configured).origin;
  } catch {
    return "https://actrezz.online";
  }
}

export async function GET(request: NextRequest) {
  const tagUrl = process.env.EXOCLICK_SHORTS_VAST_URL;
  if (!tagUrl) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const origin = siteOrigin();
    const response = await fetch(tagUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
        Origin: origin,
        Referer: `${origin}/shorts`,
        "User-Agent": request.headers.get("user-agent") || "Actrezz Shorts VAST client",
        ...(request.headers.get("accept-language")
          ? { "Accept-Language": request.headers.get("accept-language") as string }
          : {}),
      },
    });

    if (!response.ok) {
      return new Response(null, { status: 502, headers: { "Cache-Control": "private, no-store" } });
    }

    return new Response(await response.text(), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "application/xml; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch {
    return new Response(null, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
