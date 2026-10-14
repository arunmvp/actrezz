import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const env = process.env;
const account = env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID || env.cloudflare_account_id;
const token = (env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_ACCESS_TOKEN || env.cloudflare_access_token || "").trim();
const siteUrl = (env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online").replace(/\/+$/, "");
const siteHost = new URL(siteUrl).hostname;
const zoneName = siteHost.startsWith("www.") ? siteHost.slice(4) : siteHost;
const mediaUrl = (env.NEXT_PUBLIC_MEDIA_URL || `https://media.${zoneName}`).replace(/\/+$/, "");
const mediaHost = new URL(mediaUrl).hostname;
const phase = "http_request_cache_settings";

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
    const message = (data.errors || []).map((error) => `${error.code ? `${error.code}: ` : ""}${error.message}`).join("; ") || response.statusText;
    const err = new Error(`Cloudflare ${method} ${path} failed (${response.status}): ${message}`);
    err.status = response.status;
    throw err;
  }
  return data.result;
}

const hosts = `{"${zoneName}" "www.${zoneName}"}`;
const privatePaths = [
  "/admin",
  "/api/admin",
  "/api/local-media",
  "/api/r2-media",
  "/api/public/notifications",
  "/shorts",
  "/sitemap.xml",
  "/video-sitemap.xml",
];
const privatePathExpression = privatePaths.map((path) => `starts_with(http.request.uri.path, "${path}")`).join(" or ");

const rules = [
  {
    ref: "actrezz_cache_public_images",
    description: "Actrezz - cache public R2 thumbnails and profile images",
    expression: `(http.request.method eq "GET" and http.host eq "${mediaHost}" and (starts_with(http.request.uri.path, "/thumbnails/") or starts_with(http.request.uri.path, "/actresses/")))`,
    action: "set_cache_settings",
    action_parameters: {
      cache: true,
      edge_ttl: {
        mode: "override_origin",
        default: 31536000,
        status_code_ttl: [
          { status_code_range: { to: 299 }, value: 31536000 },
          { status_code_range: { from: 300, to: 499 }, value: 0 },
          { status_code_range: { from: 500 }, value: -1 },
        ],
      },
      browser_ttl: { mode: "respect_origin" },
      cache_key: {
        cache_deception_armor: true,
        ignore_query_strings_order: true,
      },
    },
    enabled: true,
  },
  {
    ref: "actrezz_bypass_private_routes",
    description: "Actrezz - bypass cache for admin, private and fresh routes",
    expression: `(http.host in ${hosts} and (${privatePathExpression}))`,
    action: "set_cache_settings",
    action_parameters: { cache: false },
    enabled: true,
  },
  {
    ref: "actrezz_cache_public_get_routes",
    description: "Actrezz - cache public GET pages and public read APIs",
    expression: `(http.request.method eq "GET" and http.host in ${hosts} and not (${privatePathExpression}) and not http.cookie contains "actrezz_admin")`,
    action: "set_cache_settings",
    action_parameters: {
      cache: true,
      edge_ttl: {
        mode: "override_origin",
        default: 900,
        status_code_ttl: [
          { status_code_range: { to: 299 }, value: 900 },
          { status_code_range: { from: 300, to: 399 }, value: 300 },
          { status_code_range: { from: 400, to: 499 }, value: 0 },
          { status_code_range: { from: 500 }, value: -1 },
        ],
      },
      browser_ttl: { mode: "respect_origin" },
      cache_key: {
        cache_deception_armor: true,
        ignore_query_strings_order: true,
      },
    },
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

  const existingRules = (entrypoint?.rules || []).filter((rule) => !String(rule.ref || "").startsWith("actrezz_"));
  const body = {
    name: entrypoint?.name || "Actrezz cache rules",
    description: "Actrezz public edge cache rules",
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
    mediaHost,
    phase,
    installedRules: rules.map((rule) => rule.description),
    edgeTtlSeconds: { publicPages: 900, publicImages: 31536000 },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
