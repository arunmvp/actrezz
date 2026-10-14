import type { MetadataRoute } from "next";

// Keep sitemap discovery current immediately after a catalogue publish instead
// of allowing a generated robots.txt artifact to outlive a Worker release.
export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online";
const blockedAgents = [
  "GPTBot", "ChatGPT-User", "OAI-SearchBot", "OAI-AdsBot",
  "ClaudeBot", "Claude-SearchBot", "Claude-User", "Claude-Web", "anthropic-ai",
  "PerplexityBot", "Perplexity-User",
  "Google-CloudVertexBot", "Google-Extended", "GoogleOther", "Google-NotebookLM", "GoogleAgent-Search",
  "GoogleAgent-Mariner", "Google-Agent", "Google-Pinpoint", "Gemini-Deep-Research",
  "Bytespider", "TikTokSpider", "imageSpider", "CCBot",
  "Applebot", "Applebot-Extended", "archive.org_bot", "ia_archiver", "Meta-ExternalAgent", "meta-externalfetcher",
  "Meta-ExternalFetcher", "Meta-WebIndexer", "meta-webindexer", "FacebookBot", "FacebookExternalHit", "facebookexternalhit",
  "MistralAI-User", "MistralAI-Index", "MistralAI-Training",
  "Diffbot", "omgili", "ImagesiftBot", "YouBot", "DuckAssistBot", "Amazonbot", "Amzn-User",
  "cohere-ai", "Coherebot", "Cohere-AI", "AI2Bot",
  "Timpibot", "KangarooBot", "AwarioBot", "PetalBot", "DataForSeoBot", "AhrefsBot", "SemrushBot",
  "SemrushBot-SA", "MJ12bot", "DotBot", "BLEXBot", "serpstatbot", "SEOkicks", "Screaming Frog",
  "SiteAuditBot", "rogerbot", "Barkrowler", "ZoominfoBot", "SeekportBot", "linkdexbot", "SISTRIX",
  "Cincraw", "MauiBot", "MegaIndex", "Qwantify", "Exabot", "Baiduspider", "Sogou", "SeznamBot", "MojeekBot",
  "TurnitinBot",
];

// Search engines used by the site's audience are deliberately explicit here.
// This makes their policy unambiguous even if a future wildcard or bot block
// is added below. Cloudflare must still allow verified bots at the edge.
const allowedSearchAgents = ["Googlebot", "bingbot", "YandexBot", "Yeti", "YetiBot", "DuckDuckBot"];

export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_INDEXING_ENABLED === "false") return { rules: [{ userAgent: "*", disallow: "/" }], host: siteUrl };
  return {
    rules: [
      { userAgent: allowedSearchAgents, allow: "/" },
      { userAgent: blockedAgents.filter((agent) => !allowedSearchAgents.includes(agent)), disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/*", "/api", "/api/*", "/search"],
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`, `${siteUrl}/video-sitemap.xml`],
    host: siteUrl,
  };
}
