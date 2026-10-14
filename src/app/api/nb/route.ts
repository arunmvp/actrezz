import { NextResponse } from "next/server";

type NeverBlockResponse = {
  zones?: Array<{
    idzone?: string | number;
    type?: string;
    data?: { image?: string; url?: string; width?: string | number; height?: string | number };
  }>;
};

function allowedZones() {
  return new Set([
    process.env.EXOCLICK_WATCH_DESKTOP_TOP_ZONE_ID,
    process.env.EXOCLICK_WATCH_DESKTOP_BOTTOM_ZONE_ID,
    process.env.EXOCLICK_WATCH_MOBILE_BANNER_ZONE_ID || process.env.EXOCLICK_WATCH_MOBILE_ZONE_ID,
    process.env.EXOCLICK_FOOTER_DESKTOP_ZONE_ID || "6042632",
    process.env.EXOCLICK_FOOTER_MOBILE_ZONE_ID || "6042634",
    ...(process.env.EXOCLICK_GRID_OUTSTREAM_ZONE_IDS || "").split(",").map((value) => value.trim()),
    ...(process.env.EXOCLICK_GRID_DESKTOP_ZONE_IDS || "").split(",").map((value) => value.trim()),
    ...(process.env.EXOCLICK_GRID_MOBILE_ZONE_IDS || "").split(",").map((value) => value.trim()),
  ].filter((value): value is string => Boolean(value)));
}

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function clickUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    // ExoClick's documented NeverBlock examples still use HTTP tracking links.
    // This is a user-initiated top-level navigation, never an executable or
    // embedded resource; image creatives themselves remain HTTPS-only.
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function emptyResponse(reason: string, status = 204) {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "X-NeverBlock": reason },
  });
}

export async function GET(request: Request) {
  if (process.env.EXOCLICK_NEVERBLOCK_ENABLED?.trim() !== "true") {
    return emptyResponse("disabled");
  }

  const zoneId = new URL(request.url).searchParams.get("zone") || "";
  if (!allowedZones().has(zoneId)) {
    return emptyResponse("zone-not-allowed", 404);
  }

  const visitorIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!visitorIp) {
    return emptyResponse("missing-ip");
  }

  const endpoint = new URL("https://syndication-adblock.exoclick.com/ads-multi.php");
  endpoint.searchParams.set("v", "1");
  endpoint.searchParams.set("zones[0][idzone]", zoneId);
  endpoint.searchParams.set("user_ip", visitorIp);

  try {
    const response = await fetch(endpoint, {
      headers: {
        "X-Forwarded-For": visitorIp,
        Referer: new URL(request.url).origin,
        "User-Agent": request.headers.get("user-agent") || "Mozilla/5.0",
        "Accept-Language": request.headers.get("accept-language") || "en",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`NeverBlock responded ${response.status}`);
    const payload = await response.json() as NeverBlockResponse;
    const zone = payload.zones?.find((item) => String(item.idzone) === zoneId);
    const imageUrl = httpsUrl(zone?.data?.image);
    const destinationUrl = clickUrl(zone?.data?.url);
    if (!imageUrl || !destinationUrl || zone?.type !== "banner") throw new Error("No compatible banner creative");

    return NextResponse.json({
      creative: {
        imageUrl,
        clickUrl: destinationUrl,
        width: numberOrUndefined(zone.data?.width),
        height: numberOrUndefined(zone.data?.height),
      },
    }, {
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  } catch {
    return emptyResponse("no-compatible-creative");
  }
}
