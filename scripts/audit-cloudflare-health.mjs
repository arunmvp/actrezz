import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const account = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.cloudflare_account_id;
const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN || process.env.CLOUDFLARE_API_TOKEN || process.env.cloudflare_access_token;
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online").replace(/\/+$/, "");
const siteHost = new URL(siteUrl).hostname;
const zoneName = siteHost.replace(/^www\./, "");

if (!account || !token) throw new Error("Cloudflare credentials are missing.");

async function api(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  if (!response.ok || body.success === false) throw new Error((body.errors || []).map((item) => item.message).join("; ") || response.statusText);
  return body.result;
}

async function graph(query, variables) {
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(body.errors?.map((item) => item.message).join("; ") || response.statusText);
  return body.data;
}

function dayWindow(offset) {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() + offset);
  const end = new Date(day);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: day.toISOString().replace(".000Z", "Z"), end: end.toISOString().replace(".000Z", "Z") };
}

const totalsQuery = `query SiteTotals($zoneTag: string, $filter: filter) {
  viewer { zones(filter: { zoneTag: $zoneTag }) {
    httpRequestsAdaptiveGroups(limit: 1, filter: $filter) {
      count
      sum { visits edgeResponseBytes }
    }
  }}
}`;

const countryQuery = `query CountryTraffic($zoneTag: string, $filter: filter) {
  viewer { zones(filter: { zoneTag: $zoneTag }) {
    httpRequestsAdaptiveGroups(limit: 25, filter: $filter, orderBy: [count_DESC]) {
      count
      sum { visits edgeResponseBytes }
      dimensions { clientCountryName }
    }
  }}
}`;

const errorDetailQuery = `query ErrorDetail($zoneTag: string, $filter: filter) {
  viewer { zones(filter: { zoneTag: $zoneTag }) {
    httpRequestsAdaptiveGroups(limit: 30, filter: $filter, orderBy: [count_DESC]) {
      count
      dimensions { clientRequestPath edgeResponseStatus coloCode }
    }
  }}
}`;

try {
  const zones = await api(`/zones?name=${encodeURIComponent(zoneName)}&account.id=${encodeURIComponent(account)}`);
  const zone = zones[0];
  if (!zone) throw new Error(`Cloudflare zone not found: ${zoneName}`);
  const [script, ruleset, zoneSettings, deployments] = await Promise.all([
    api(`/accounts/${account}/workers/scripts/actrezz/settings`),
    api(`/zones/${zone.id}/rulesets/phases/http_request_cache_settings/entrypoint`).catch(() => null),
    api(`/zones/${zone.id}/settings`).catch(() => []),
    api(`/accounts/${account}/workers/scripts/actrezz/deployments`).catch(() => []),
  ]);
  const trafficFilter = (host, only5xx = false) => ({ AND: [
    { datetime_geq: dayWindow(0).start },
    { datetime_lt: dayWindow(0).end },
    { requestSource: "eyeball" },
    { clientRequestHTTPHost: host },
    ...(only5xx ? [{ edgeResponseStatus_geq: 500 }, { edgeResponseStatus_lt: 600 }] : []),
  ] });
  const [today, yesterday, countries, country5xx, mediaCountries, media5xx, errorDetails] = await Promise.all([
    graph(totalsQuery, { zoneTag: zone.id, filter: { AND: [{ datetime_geq: dayWindow(0).start }, { datetime_lt: dayWindow(0).end }, { requestSource: "eyeball" }, { clientRequestHTTPHost: siteHost }] } }).catch((error) => ({ error: error.message })),
    graph(totalsQuery, { zoneTag: zone.id, filter: { AND: [{ datetime_geq: dayWindow(-1).start }, { datetime_lt: dayWindow(-1).end }, { requestSource: "eyeball" }, { clientRequestHTTPHost: siteHost }] } }).catch((error) => ({ error: error.message })),
    graph(countryQuery, { zoneTag: zone.id, filter: trafficFilter(siteHost) }).catch((error) => ({ error: error.message })),
    graph(countryQuery, { zoneTag: zone.id, filter: trafficFilter(siteHost, true) }).catch((error) => ({ error: error.message })),
    graph(countryQuery, { zoneTag: zone.id, filter: trafficFilter("media.actrezz.online") }).catch((error) => ({ error: error.message })),
    graph(countryQuery, { zoneTag: zone.id, filter: trafficFilter("media.actrezz.online", true) }).catch((error) => ({ error: error.message })),
    graph(errorDetailQuery, { zoneTag: zone.id, filter: trafficFilter(siteHost, true) }).catch((error) => ({ error: error.message })),
  ]);
  const group = (result) => result.viewer.zones[0]?.httpRequestsAdaptiveGroups[0] || { count: 0, sum: { visits: 0, edgeResponseBytes: 0 } };
  const countryGroups = (result) => result.error ? { unavailable: true, reason: result.error } : (result.viewer.zones[0]?.httpRequestsAdaptiveGroups || []).map((item) => ({ country: item.dimensions.clientCountryName || "Unknown", requests: item.count, visits: item.sum?.visits ?? 0, edgeResponseBytes: item.sum?.edgeResponseBytes ?? 0 }));
  const output = {
    checkedAt: new Date().toISOString(),
    siteHost,
    worker: {
      usageModel: script.usage_model || null,
      workerCacheEnabled: script.cache_options?.enabled ?? null,
      observability: script.observability || null,
    },
    latestDeployment: deployments[0] ? { id: deployments[0].id, createdOn: deployments[0].created_on, source: deployments[0].source } : null,
    cacheRules: (ruleset?.rules || []).filter((rule) => String(rule.ref || "").startsWith("actrezz_")).map((rule) => ({ ref: rule.ref, enabled: rule.enabled, action: rule.action })),
    zoneSecurity: Object.fromEntries((zoneSettings || [])
      .filter((setting) => ["security_level", "browser_check", "challenge_ttl", "bot_fight_mode", "super_bot_fight_mode", "cache_level", "development_mode"].includes(setting.id))
      .map((setting) => [setting.id, setting.value])),
    traffic: today.error || yesterday.error ? { unavailable: true, reason: today.error || yesterday.error } : {
      todayUtc: group(today),
      yesterdayUtc: group(yesterday),
      topCountriesToday: countryGroups(countries),
      country5xxToday: countryGroups(country5xx),
      mediaCountriesToday: countryGroups(mediaCountries),
      media5xxToday: countryGroups(media5xx),
      top5xxToday: errorDetails.error ? { unavailable: true, reason: errorDetails.error } : (errorDetails.viewer.zones[0]?.httpRequestsAdaptiveGroups || []).map((item) => ({ path: item.dimensions.clientRequestPath || "Unknown", status: item.dimensions.edgeResponseStatus ?? null, colo: item.dimensions.coloCode || "Unknown", requests: item.count })),
    },
    note: "Analytics is sampled/aggregated and not a billing meter. A Workers daily-quota outage returns Cloudflare error 1027; CPU/memory resource exhaustion returns 1102.",
  };
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(`Cloudflare health audit failed: ${error.message}`);
  process.exitCode = 1;
}
