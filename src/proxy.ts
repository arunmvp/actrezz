import { NextResponse, type NextRequest } from "next/server";

const allowedSearchBots = /(?:Googlebot|Google-InspectionTool|Bingbot|BingPreview|YandexBot|YandexImages|YandexMobileBot|Naverbot|Yeti)/i;
const blockedKnownBots = /(?:GPTBot|ChatGPT-User|OAI-SearchBot|OAI-AdsBot|ClaudeBot|Claude-SearchBot|Claude-User|Claude-Web|anthropic-ai|PerplexityBot|Perplexity-User|Google-CloudVertexBot|Google-Extended|GoogleOther|Google-NotebookLM|GoogleAgent-Search|GoogleAgent-Mariner|Google-Agent|Google-Pinpoint|Gemini-Deep-Research|Bytespider|TikTokSpider|imageSpider|CCBot|Applebot|Applebot-Extended|archive\.org_bot|ia_archiver|Meta-ExternalAgent|meta-externalagent|Meta-ExternalFetcher|meta-externalfetcher|Meta-WebIndexer|meta-webindexer|FacebookBot|FacebookExternalHit|facebookexternalhit|MistralAI-User|MistralAI-Index|MistralAI-Training|Amazonbot|Amzn-User|YouBot|DuckAssistBot|DuckDuckBot|Diffbot|omgili|ImagesiftBot|cohere-ai|Coherebot|Cohere-AI|AI2Bot|Timpibot|KangarooBot|AwarioBot|PetalBot|DataForSeoBot|AhrefsBot|SemrushBot|SemrushBot-SA|MJ12bot|DotBot|BLEXBot|serpstatbot|SEOkicks|Screaming Frog|SiteAuditBot|rogerbot|Barkrowler|ZoominfoBot|SeekportBot|linkdexbot|SISTRIX|Cincraw|MauiBot|MegaIndex|Qwantify|Exabot|Baiduspider|Sogou|SeznamBot|MojeekBot|TurnitinBot|Scrapy|python-requests|curl|Wget)/i;
const blockedBotLike = /(?:bot|crawler|spider|scraper|crawl|analyzer|audit|scanner|indexer|ranking|seo|serp|backlink|monitor|checker|archiver)/i;

export function proxy(request: NextRequest) {
  if (request.nextUrl.hostname === "www.actrezz.online" || request.nextUrl.hostname.endsWith(".workers.dev")) {
    const url = request.nextUrl.clone();
    url.hostname = "actrezz.online";
    return NextResponse.redirect(url, 308);
  }

  const userAgent = request.headers.get("user-agent") || "";
  const shouldBlock = userAgent && !allowedSearchBots.test(userAgent) && (blockedKnownBots.test(userAgent) || blockedBotLike.test(userAgent));
  if (shouldBlock) {
    return new NextResponse("Blocked", {
      status: 403,
      headers: {
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
