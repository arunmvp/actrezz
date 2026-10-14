import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const env = process.env;
const account = env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID || env.cloudflare_account_id;
const token = env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_ACCESS_TOKEN || env.cloudflare_access_token;
const siteUrl = (env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online").replace(/\/+$/, "");
const siteHost = new URL(siteUrl).hostname;
const zoneName = siteHost.startsWith("www.") ? siteHost.slice(4) : siteHost;
const phase = "http_request_firewall_custom";

if (!account || !token) throw new Error("Cloudflare credentials are missing.");

async function cloudflare(path, method = "GET", body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const message = (data.errors || []).map((error) => error.message).join("; ") || response.statusText;
    const err = new Error(`Cloudflare ${method} ${path} failed (${response.status}): ${message}`);
    err.status = response.status;
    throw err;
  }
  return data.result;
}

function containsAny(values) {
  return values.map((value) => `lower(http.user_agent) contains "${value.toLowerCase()}"`).join(" or ");
}

const allowedSearch = [
  "Googlebot",
  "Google-InspectionTool",
  "Bingbot",
  "BingPreview",
  "YandexBot",
  "YandexImages",
  "YandexMobileBot",
  "Naverbot",
  "Yeti",
  "SeznamBot",
];

const aiBots = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "OAI-AdsBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-CloudVertexBot",
  "Google-Extended",
  "GoogleOther",
  "Google-NotebookLM",
  "GoogleAgent-Search",
  "GoogleAgent-Mariner",
  "Google-Agent",
  "Google-Pinpoint",
  "Gemini-Deep-Research",
  "Applebot",
  "Applebot-Extended",
  "Bytespider",
  "TikTokSpider",
  "imageSpider",
  "CCBot",
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "Meta-WebIndexer",
  "FacebookBot",
  "facebookexternalhit",
  "MistralAI-User",
  "MistralAI-Index",
  "MistralAI-Training",
  "YouBot",
  "DuckAssistBot",
  "Amazonbot",
  "Amzn-User",
  "cohere-ai",
  "Coherebot",
  "Cohere-AI",
  "AI2Bot",
];

const archiveAndSeoBots = [
  "archive.org_bot",
  "ia_archiver",
  "AhrefsBot",
  "SemrushBot",
  "SemrushBot-SA",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
  "serpstatbot",
  "SEOkicks",
  "Screaming Frog",
  "SiteAuditBot",
  "Barkrowler",
  "ZoominfoBot",
  "SeekportBot",
  "linkdexbot",
  "SISTRIX",
  "MegaIndex",
  "Qwantify",
  "Exabot",
  "Baiduspider",
  "Sogou",
  "MojeekBot",
  "TurnitinBot",
  "Scrapy",
  "python-requests",
  "curl",
  "Wget",
];

const genericBotTerms = [
  "bot",
  "crawler",
  "spider",
  "scraper",
  "crawl",
  "analyzer",
  "audit",
  "scanner",
  "indexer",
  "ranking",
  "seo",
  "serp",
  "backlink",
  "monitor",
  "checker",
  "archiver",
];

// Common vulnerability-scanner probe paths. These never map to real routes, so
// blocking them at the edge stops the scanner traffic from ever reaching the
// Worker (saving invocations) and removes the 404 noise from analytics.
const scannerPathContains = [
  "/.env",
  "/.git",
  "/wp-admin",
  "/wp-login",
  "/wp-content",
  "/wp-includes",
  "/xmlrpc.php",
  "/phpinfo",
  "/phpmyadmin",
  "/vendor/",
  "/.aws",
  "/.ssh",
  "/config.php",
  "/shell",
  "/cgi-bin/",
];
const scannerPathSuffix = [".env", ".php", ".asp", ".aspx", ".jsp", ".sql", ".bak", ".old"];
const scannerPathExpression = [
  ...scannerPathContains.map((p) => `lower(http.request.uri.path) contains "${p}"`),
  ...scannerPathSuffix.map((p) => `ends_with(lower(http.request.uri.path), "${p}")`),
].join(" or ");

const rules = [
  {
    ref: "actrezz_block_scanner_paths",
    description: "Actrezz - block vulnerability scanner probe paths (.env, wp-admin, phpinfo, php files)",
    expression: `(http.host in {"${zoneName}" "www.${zoneName}"} and (${scannerPathExpression}))`,
    action: "block",
    enabled: true,
  },
  {
    ref: "actrezz_protect_r2_videos",
    description: "Actrezz - prevent direct and third-party video hotlinking",
    expression: `(http.host eq "media.${zoneName}" and starts_with(http.request.uri.path, "/videos/") and http.request.method in {"GET" "HEAD"} and not any(http.request.headers["sec-fetch-site"][*] in {"same-origin" "same-site"}) and not starts_with(http.referer, "${siteUrl}/") and not starts_with(http.referer, "http://localhost:3000/") and not starts_with(http.referer, "http://127.0.0.1:3000/") and not (${containsAny(allowedSearch)}))`,
    action: "block",
    enabled: true,
  },
  {
    // AI crawlers + archive/SEO scrapers combined. Kept separate from the
    // generic-bot rule so each expression stays under Cloudflare's 4096-char
    // limit while the whole set stays within the Free plan's 5-rule cap.
    ref: "actrezz_block_ai_archive_bots",
    description: "Actrezz - block AI crawlers and archive/SEO scraping tools",
    expression: `((${containsAny([...aiBots, ...archiveAndSeoBots])}) and not (${containsAny(allowedSearch)}))`,
    action: "block",
    enabled: true,
  },
  {
    ref: "actrezz_block_generic_non_search_bots",
    description: "Actrezz - block generic non-search bots",
    expression: `((${containsAny(genericBotTerms)}) and not (${containsAny(allowedSearch)}))`,
    action: "block",
    enabled: true,
  },
];

async function main() {
  const zones = await cloudflare(`/zones?name=${encodeURIComponent(zoneName)}&account.id=${encodeURIComponent(account)}`);
  const zone = zones[0];
  if (!zone) throw new Error(`Cloudflare zone not found for ${zoneName}.`);

  let entrypoint = null;
  try {
    entrypoint = await cloudflare(`/zones/${zone.id}/rulesets/phases/${phase}/entrypoint`);
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  // Rebuild every rule we manage (any `actrezz_` ref, including the hotlink and
  // scanner rules) and preserve only rules created outside this script. This
  // avoids "cannot reference the same rule more than once" duplicate-ref errors
  // when a managed rule already exists in the ruleset.
  const managedRefs = new Set(rules.map((rule) => rule.ref));
  const existingRules = (entrypoint?.rules || []).filter((rule) => {
    const ref = String(rule.ref || "");
    return !managedRefs.has(ref) && !ref.startsWith("actrezz_");
  });
  const body = {
    name: entrypoint?.name || "Actrezz custom WAF",
    description: "Actrezz edge firewall rules",
    kind: "zone",
    phase,
    rules: [...rules, ...existingRules],
  };

  if (entrypoint?.id) {
    await cloudflare(`/zones/${zone.id}/rulesets/${entrypoint.id}`, "PUT", body);
  } else {
    await cloudflare(`/zones/${zone.id}/rulesets`, "POST", body);
  }

  console.log(JSON.stringify({
    zone: zone.name,
    phase,
    installedRules: rules.map((rule) => rule.description),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
