import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const API_ROOT = "https://api.exoclick.com/v2";
const apiToken = String(process.env.EXOCLICK_API_TOKEN || process.env.exoclick_api_token || "").trim();
const mode = String(process.argv[2] || "audit").toLowerCase();

if (!apiToken) {
  throw new Error("EXOCLICK_API_TOKEN (or exoclick_api_token) is missing from .env.local.");
}

function tokenFrom(value) {
  if (!value || typeof value !== "object") return "";
  for (const key of ["token", "session_token", "sessionToken", "access_token"]) {
    if (typeof value[key] === "string" && value[key]) return value[key];
  }
  for (const key of ["data", "result", "response"]) {
    const found = tokenFrom(value[key]);
    if (found) return found;
  }
  return "";
}

function collectionFrom(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["result", "data", "items", "sites", "zones", "collection"]) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested;
    if (nested && typeof nested === "object") {
      const found = collectionFrom(nested);
      if (found.length) return found;
    }
  }
  return [];
}

function safeErrorBody(value) {
  if (typeof value === "string") return value.slice(0, 500);
  if (!value || typeof value !== "object") return value;
  const clone = structuredClone(value);
  const redact = (item) => {
    if (!item || typeof item !== "object") return;
    for (const [key, nested] of Object.entries(item)) {
      if (/token|authorization|secret|password/i.test(key)) item[key] = "[redacted]";
      else redact(nested);
    }
  };
  redact(clone);
  return clone;
}

async function request(path, { method = "GET", sessionToken, body, allowError = false } = {}) {
  let response;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status !== 429 || attempt === 3) break;
    const retryAfter = Math.min(10, Math.max(2, Number(response.headers.get("retry-after")) || (attempt + 1) * 2));
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000));
  }
  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Keep the bounded text response for diagnostics.
  }
  if (!response.ok && !allowError) {
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(safeErrorBody(data))}`);
  }
  return { status: response.status, headers: response.headers, data };
}

async function getSiteZones(sessionToken, siteId) {
  const response = await request(`/zones?limit=50&idsite=${siteId}`, { sessionToken });
  return collectionFrom(response.data);
}

async function login() {
  const response = await request("/login", { method: "POST", body: { api_token: apiToken } });
  const sessionToken = tokenFrom(response.data);
  if (!sessionToken) throw new Error("ExoClick login succeeded but no session token was returned.");
  return sessionToken;
}

function compactSite(site) {
  return {
    id: site.id ?? site.site_id ?? null,
    name: site.name ?? site.title ?? site.domain ?? null,
    domain: site.domain ?? site.url ?? null,
    status: site.status ?? site.state ?? null,
  };
}

function compactZone(zone) {
  return {
    id: zone.id ?? zone.zone_id ?? null,
    siteId: zone.idsite ?? zone.site_id ?? zone.siteId ?? zone.site?.id ?? null,
    siteName: zone.site_name ?? zone.site?.name ?? null,
    name: zone.name ?? zone.title ?? null,
    type: zone.publisher_ad_type_label ?? zone.publisher_ad_type ?? zone.type ?? zone.format ?? zone.ad_format ?? zone.zone_type ?? null,
    size: zone.size ?? zone.dimension ?? zone.dimensions ?? (
      zone.width && zone.height ? `${zone.width}x${zone.height}` : null
    ),
    status: zone.status ?? zone.state ?? zone.active ?? null,
    refreshSeconds: zone.ad_refresh_rate ?? null,
    editable: zone.is_editable ?? null,
  };
}

async function getAllZones(sessionToken) {
  const items = [];
  for (let offset = 0; offset < 5_000; offset += 50) {
    const response = await request(`/zones?limit=50&offset=${offset}`, { sessionToken, allowError: true });
    if (response.status === 404) break;
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GET /zones failed at offset ${offset} (${response.status}).`);
    }
    const page = collectionFrom(response.data);
    items.push(...page);
    if (page.length < 50) break;
  }
  return items;
}

async function audit() {
  const sessionToken = await login();
  const [sitesResponse, rawZones, zonesOptions] = await Promise.all([
    request("/sites?limit=50", { sessionToken }),
    getAllZones(sessionToken),
    request("/zones", { method: "OPTIONS", sessionToken, allowError: true }),
  ]);
  const sites = collectionFrom(sitesResponse.data).map(compactSite);
  const siteIds = new Set(
    sites
      .filter((site) => /actrezz/i.test(`${site.name || ""} ${site.domain || ""}`))
      .map((site) => String(site.id)),
  );
  const allZones = rawZones.map(compactZone);
  const zones = siteIds.size
    ? allZones.filter((zone) => siteIds.has(String(zone.siteId)))
    : allZones.filter((zone) => /actrezz/i.test(String(zone.name || "")));
  const allow = zonesOptions.headers.get("allow");

  console.log(JSON.stringify({
    mode: "audit",
    login: "ok",
    sites: sites.filter((site) => /actrezz/i.test(`${site.name || ""} ${site.domain || ""}`)),
    zones,
    zoneCount: zones.length,
    allZoneCount: allZones.length,
    allZoneSamples: allZones.slice(0, 20),
    reusableTemplateZones: allZones.filter((zone) =>
      zone.siteName === "Actrexx" && /Multi-Format|Recommendation Widget/.test(String(zone.type || ""))
    ),
    allRecommendationZones: allZones.filter((zone) => zone.type === "Recommendation Widget").slice(0, 30),
    rawZoneItemKeys: rawZones[0]
      ? Object.keys(rawZones[0]).sort()
      : [],
    zonesOptions: {
      status: zonesOptions.status,
      allow,
      response: safeErrorBody(zonesOptions.data),
    },
  }, null, 2));
}

async function details() {
  const ids = process.argv.slice(3).filter((value) => /^\d+$/.test(value));
  if (!ids.length) throw new Error("Pass one or more numeric zone IDs after details.");
  const sessionToken = await login();
  const results = [];
  for (const id of ids) {
    const [response, snippet] = await Promise.all([
      request(`/zones/${id}`, { sessionToken, allowError: true }),
      request(`/zones/${id}/snippet`, { sessionToken, allowError: true }),
    ]);
    results.push({
      id,
      status: response.status,
      data: safeErrorBody(response.data),
      snippet: { status: snippet.status, data: safeErrorBody(snippet.data) },
    });
  }
  console.log(JSON.stringify({ mode: "details", results }, null, 2));
}

async function publisherStats() {
  const sessionToken = await login();
  const dateFrom = process.argv[3] || new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const dateTo = process.argv[4] || new Date().toISOString().slice(0, 10);
  if (![dateFrom, dateTo].every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new Error("Usage: node scripts/exoclick-zones.mjs stats YYYY-MM-DD YYYY-MM-DD");
  }
  const body = {
    count: 0,
    detailed: 0,
    timezone: "Asia/Kolkata",
    totals: 1,
    filter: { site_id: [1112830], date_from: dateFrom, date_to: dateTo },
    group_by: ["zone_id", "country_iso"],
    order_by: [{ field: "impressions", order: "desc" }],
    limit: 500,
    offset: 0,
  };
  const response = await request("/statistics/publisher/global", {
    method: "POST", sessionToken, body,
  });
  const rows = collectionFrom(response.data);
  const byZone = new Map();
  const videoViewsByZone = new Map();
  const byCountry = new Map();
  for (const row of rows) {
    const zone = String(row.group_by?.zone_id?.id || "unknown");
    const country = String(row.group_by?.country_iso?.country_iso || "unknown");
    const impressions = Number(row.impressions || 0);
    byZone.set(zone, (byZone.get(zone) || 0) + impressions);
    videoViewsByZone.set(zone, (videoViewsByZone.get(zone) || 0) + Number(row.video?.views || 0));
    byCountry.set(country, (byCountry.get(country) || 0) + impressions);
  }
  const sorted = (group) => [...group].map(([name, impressions]) => ({ name, impressions }))
    .sort((a, b) => b.impressions - a.impressions);
  console.log(JSON.stringify({
    mode: "stats", dateFrom, dateTo, rows: rows.length,
    totalImpressions: rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0),
    zones: sorted(byZone).map((item) => ({ ...item, videoViews: videoViewsByZone.get(item.name) || 0 })),
    countries: sorted(byCountry).slice(0, 30),
    responseKeys: Object.keys(response.data || {}),
  }, null, 2));
}

async function syncPopunders() {
  const ids = [
    process.env.EXOCLICK_POPUNDER_DESKTOP_ZONE_ID,
    process.env.EXOCLICK_POPUNDER_MOBILE_ZONE_ID,
  ].filter((value) => /^\d+$/.test(String(value || "")));
  if (!ids.length) throw new Error("No desktop or mobile popunder zone IDs are configured.");
  const sessionToken = await login();
  const settings = {
    frequency: Number.parseInt(process.env.EXOCLICK_POPUNDER_FREQUENCY_PERIOD || "1", 10),
    frequency_count: Number.parseInt(process.env.EXOCLICK_POPUNDER_FREQUENCY_COUNT || "3", 10),
    pop_trigger_method: String(process.env.EXOCLICK_POPUNDER_TRIGGER_METHOD || "1"),
    pop_trigger_delay: Number.parseInt(process.env.EXOCLICK_POPUNDER_TRIGGER_DELAY || "0", 10),
    popup_fallback: 0,
    // Required for Chromium to preserve the catalogue navigation in the
    // current tab while the advertising destination opens separately.
    popup_force: 1,
    chrome_enabled: 1,
    // In ExoClick's current Chrome runtime, tab mode keeps the catalogue
    // navigation in this tab and opens the advertising destination separately.
    new_tab: 1,
    capping_enabled: 1,
    is_responsive_zone: 1,
  };
  const results = [];
  for (const id of ids) {
    await request(`/zones/${id}`, { method: "PUT", sessionToken, body: settings });
    const response = await request(`/zones/${id}`, { sessionToken });
    const zone = zoneObject(response.data);
    results.push({
      id: Number(id),
      active: zone.active,
      frequencyPeriodMinutes: zone.frequency,
      frequencyCount: zone.frequency_count,
      triggerMethod: zone.pop_trigger_method,
      triggerDelaySeconds: zone.pop_trigger_delay,
      chromeEnabled: zone.chrome_enabled,
      newTab: zone.new_tab,
      cappingEnabled: zone.capping_enabled,
    });
  }
  console.log(JSON.stringify({ mode: "sync-popunders", results }, null, 2));
}

async function syncFooterOutstream() {
  const id = String(process.env.EXOCLICK_FOOTER_OUTSTREAM_ZONE_ID || "");
  if (!/^\d+$/.test(id)) throw new Error("EXOCLICK_FOOTER_OUTSTREAM_ZONE_ID is not configured.");
  const sessionToken = await login();
  const settings = {
    marketing_tags: blockedMarketingTags,
    branding_enabled: 1,
    maximum_width: 720,
    cta_overlay_enabled: 1,
    fallback_ads: 1,
    is_responsive_zone: 1,
    enable_ad_transparency_dialog: 1,
  };
  await request(`/zones/${id}`, { method: "PUT", sessionToken, body: settings });
  const response = await request(`/zones/${id}`, { sessionToken });
  const zone = zoneObject(response.data);
  console.log(JSON.stringify({
    mode: "sync-footer-outstream",
    id: Number(id),
    active: zone.active,
    fallbackAds: zone.fallback_ads,
    maximumWidth: zone.maximum_width,
    responsive: zone.is_responsive_zone,
  }, null, 2));
}

async function discover() {
  const sessionToken = await login();
  const paths = ["/", "/env.php", "/docs/swagger.json", "/openapi.json", "/swagger.json", "/api-docs", "/docs"];
  const results = [];
  for (const path of paths) {
    const response = await request(path, { sessionToken, allowError: true });
    const contentType = response.headers.get("content-type");
    const methods = response.headers.get("allow") || response.headers.get("access-control-allow-methods");
    const htmlAssets = typeof response.data === "string"
      ? [...response.data.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1])
      : [];
    const configHints = typeof response.data === "string"
      ? response.data.split(/\r?\n/).map((line) => line.trim()).filter((line) => /swagger|spec|url\s*:/i.test(line)).slice(0, 30)
      : [];
    results.push({
      path,
      status: response.status,
      contentType,
      methods,
      htmlAssets,
      configHints,
      response: typeof response.data === "string"
        ? response.data.replace(/\s+/g, " ").slice(0, 300)
        : safeErrorBody(response.data),
    });
  }
  console.log(JSON.stringify({ mode: "discover", results }, null, 2));
}

function refsFrom(value, refs = new Set()) {
  if (!value || typeof value !== "object") return refs;
  if (typeof value.$ref === "string") refs.add(value.$ref);
  for (const nested of Object.values(value)) refsFrom(nested, refs);
  return refs;
}

async function schema() {
  const sessionToken = await login();
  const response = await request("/docs/swagger.json", { sessionToken });
  const spec = response.data;
  const paths = Object.fromEntries(
    Object.entries(spec.paths || {}).filter(([path]) => path.startsWith("/zones")),
  );
  const names = new Set([...refsFrom(paths)].map((ref) => ref.split("/").pop()));
  const definitions = {};
  const pending = [...names];
  while (pending.length) {
    const name = pending.shift();
    if (!name || definitions[name] || !spec.definitions?.[name]) continue;
    definitions[name] = spec.definitions[name];
    for (const ref of refsFrom(spec.definitions[name])) {
      const nestedName = ref.split("/").pop();
      if (nestedName && !definitions[nestedName]) pending.push(nestedName);
    }
  }
  console.log(JSON.stringify({ mode: "schema", paths, definitions }, null, 2));
}

async function schemaSummary() {
  const sessionToken = await login();
  const response = await request("/docs/swagger.json", { sessionToken });
  const spec = response.data;
  const definitionNames = [
    "ZoneCreate",
    "ZoneUpdate",
    "ZoneCopy",
    "ZoneCopied",
    "ZonesCollectionInt",
    "ZoneNativeAdConfiguration",
    "ZoneZones",
  ];
  const definitions = Object.fromEntries(
    definitionNames.filter((name) => spec.definitions?.[name]).map((name) => [name, spec.definitions[name]]),
  );
  const paths = Object.fromEntries(
    Object.entries(spec.paths || {}).filter(([path]) =>
      path === "/zones" || path === "/zones/{zoneId}" || path === "/zones/{zoneId}/copy" || path.includes("publisher-ad-types")
    ),
  );
  console.log(JSON.stringify({ mode: "schema-summary", paths, definitions }, null, 2));
}

async function collections() {
  const sessionToken = await login();
  const paths = [
    "/collections/publisher-ad-types?detailed=true",
    "/collections/marketing-tags",
    "/collections/product-categories",
    "/collections/compliance-rules",
    "/collections/multi-format-zone-layouts",
    "/collections/multi-format-zone-dimension",
  ];
  const results = [];
  for (const path of paths) {
    const response = await request(path, { sessionToken, allowError: true });
    results.push({ path, status: response.status, data: safeErrorBody(response.data) });
  }
  console.log(JSON.stringify({ mode: "collections", results }, null, 2));
}

async function templates() {
  const sessionToken = await login();
  const rawZones = await getAllZones(sessionToken);
  const zones = rawZones.map(compactZone).filter((zone) => /Recommendation Widget|Multi-Format/.test(String(zone.type || "")));
  console.log(JSON.stringify({ mode: "templates", zones }, null, 2));
}

async function findMultiFormatSchema() {
  const sessionToken = await login();
  const response = await request("/docs/swagger.json", { sessionToken });
  const spec = response.data;
  const paths = Object.fromEntries(
    Object.entries(spec.paths || {}).filter(([path, value]) => /multi.?format|zone.?association|\/zones/i.test(`${path} ${JSON.stringify(value)}`)),
  );
  const definitions = Object.fromEntries(
    Object.entries(spec.definitions || {}).filter(([name, value]) => /multi.?format|zone.?association|"zones"/i.test(`${name} ${JSON.stringify(value)}`)),
  );
  console.log(JSON.stringify({ mode: "find-multi-format-schema", paths, definitions }, null, 2));
}

function createdZoneId(value) {
  if (!value || typeof value !== "object") return null;
  for (const key of ["idzone", "zone_id", "id"]) {
    const parsed = Number(value[key]);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  for (const nested of Object.values(value)) {
    const found = createdZoneId(nested);
    if (found) return found;
  }
  return null;
}

function zoneObject(value) {
  return value?.result?.zone || value?.zone || value?.result || value;
}

const blockedMarketingTags = {
  type: "blocked",
  elements: [60, 71, 94], // Back Button Offer, Misleading Branding, High CTR Elements.
};

const commonDisplaySettings = {
  marketing_tags: blockedMarketingTags,
  ad_refresh_rate: 60,
  is_responsive_zone: 1,
  enable_ad_transparency_dialog: 1,
};

const desktopNativeConfiguration = {
  format: 7,
  font_family: "Arial, Helvetica, Verdana, sans-serif",
  header_font_size: 12,
  header_font_color: "#A3A3A3",
  widget_background_color: "transparent",
  minimum_width_for_full_sized_layout: 450,
  item_height: 300,
  image_height: 175,
  image_width: 175,
  title_enabled: 1,
  title_font_size: 16,
  title_font_color: "#F5F5F5",
  title_font_weight: 0,
  title_decoration: 0,
  title_hover_color: "#FF2D55",
  title_hover_decoration: 0,
  title_hover_font_weight: 0,
  description_enabled: 0,
  brand_enabled: 1,
  brand_font_size: 11,
  brand_font_color: "#A3A3A3",
  brand_font_weight: 0,
  brand_decoration: 0,
  open_in_new_window: 1,
  header_is_on_top: 1,
  header_text_align: "right",
  text_box_size: 0,
  text_position: "bottom",
  header_enabled: 0,
  customcss_enabled: 0,
  text_align: "left",
  mobile_responsive_type: 1,
  zoom: 0,
  spacing_h: 10,
  spacing_v: 10,
  mobile_breakpoint: 750,
  mobile_rows: 2,
  mobile_cols: 1,
  item_padding: 6,
  use_v2_script: 1,
  mobile_image_width: 175,
  mobile_image_height: 175,
  mobile_text_box_size: 90,
  mobile_text_enabled: 1,
  text_enabled: 1,
  mobile_text_position: "bottom",
};

const mobileNativeConfiguration = {
  format: 18,
  font_family: "Arial, Helvetica, Verdana, sans-serif",
  header_font_size: 12,
  header_font_color: "#A3A3A3",
  widget_background_color: "transparent",
  minimum_width_for_full_sized_layout: 450,
  item_height: 300,
  image_height: 450,
  image_width: 800,
  title_enabled: 1,
  title_font_size: 16,
  title_font_color: "#F5F5F5",
  title_font_weight: 0,
  title_decoration: 0,
  title_hover_color: "#FF2D55",
  title_hover_decoration: 0,
  title_hover_font_weight: 0,
  description_enabled: 0,
  brand_enabled: 1,
  brand_font_size: 11,
  brand_font_color: "#A3A3A3",
  brand_font_weight: 0,
  brand_decoration: 0,
  open_in_new_window: 1,
  header_is_on_top: 1,
  header_text_align: "right",
  text_box_size: 90,
  text_position: "bottom",
  header_enabled: 0,
  customcss_enabled: 0,
  text_align: "left",
  mobile_responsive_type: 1,
  zoom: 0,
  spacing_h: 10,
  spacing_v: 10,
  mobile_breakpoint: 800,
  mobile_rows: 1,
  mobile_cols: 1,
  item_padding: 10,
  use_v2_script: 1,
  mobile_image_width: 800,
  mobile_image_height: 450,
  mobile_text_box_size: 90,
  mobile_text_enabled: 1,
  text_enabled: 1,
  mobile_text_position: "bottom",
};

const gridNativeConfiguration = {
  format: 18,
  font_family: "Arial, Helvetica, Verdana, sans-serif",
  header_font_size: 11,
  header_font_color: "#A3A3A3",
  widget_background_color: "transparent",
  minimum_width_for_full_sized_layout: 280,
  item_height: 245,
  image_height: 450,
  image_width: 800,
  title_enabled: 1,
  title_font_size: 15,
  title_font_color: "#F5F5F5",
  title_font_weight: 0,
  title_decoration: 0,
  title_hover_color: "#FFFFFF",
  title_hover_decoration: 0,
  title_hover_font_weight: 0,
  description_enabled: 0,
  brand_enabled: 1,
  brand_font_size: 12,
  brand_font_color: "#A3A3A3",
  brand_font_weight: 0,
  brand_decoration: 0,
  open_in_new_window: 1,
  header_is_on_top: 1,
  header_text_align: "left",
  text_box_size: 72,
  text_position: "bottom",
  header_enabled: 0,
  customcss_enabled: 1,
  customcss: [
    ".exo-native-widget,.exo-native-widget *{box-sizing:border-box!important}",
    ".exo-native-widget{background:transparent!important;max-width:100%!important;width:100%!important}",
    ".exo-native-widget a{background:transparent!important;border:0!important;box-shadow:none!important}",
    ".exo-native-widget img{border-radius:12px!important;object-fit:cover!important;width:100%!important}",
  ].join(""),
  text_align: "left",
  mobile_responsive_type: 1,
  zoom: 0,
  spacing_h: 0,
  spacing_v: 0,
  mobile_breakpoint: 768,
  mobile_rows: 1,
  mobile_cols: 1,
  item_padding: 0,
  use_v2_script: 1,
  mobile_image_width: 800,
  mobile_image_height: 450,
  mobile_text_box_size: 72,
  mobile_text_enabled: 1,
  text_enabled: 1,
  mobile_text_position: "bottom",
};

async function setup() {
  const sessionToken = await login();
  const siteId = 1112830;
  let siteZones = (await getSiteZones(sessionToken, siteId)).filter((zone) => Number(zone.idsite) === siteId && Number(zone.active) === 1);
  const actions = [];

  const refresh = async () => {
    siteZones = (await getSiteZones(sessionToken, siteId)).filter((zone) => Number(zone.idsite) === siteId && Number(zone.active) === 1);
  };

  const update = async (id, body, label) => {
    await request(`/zones/${id}`, { method: "PUT", sessionToken, body });
    actions.push({ action: "updated", id, label });
  };

  const ensure = async ({ name, type, size = "", create, update: updateBody }) => {
    let zone = siteZones.find((item) => String(item.name).toLowerCase() === name.toLowerCase());
    if (!zone && type && size) {
      zone = siteZones.find((item) => Number(item.publisher_ad_type) === type && String(item.size || "") === size);
    }
    if (zone) {
      if (updateBody) await update(zone.id, { name, ...updateBody }, name);
      return { id: Number(zone.id), name, type: Number(zone.publisher_ad_type), created: false };
    }

    const response = await request("/zones", { method: "POST", sessionToken, body: { name, active: 1, idsite: siteId, publisher_ad_type: type, ...create } });
    let id = createdZoneId(response.data);
    await refresh();
    if (!id) id = Number(siteZones.find((item) => String(item.name).toLowerCase() === name.toLowerCase())?.id || 0);
    if (!id) throw new Error(`ExoClick created ${name} but did not return or expose its zone id.`);
    actions.push({ action: "created", id, label: name });
    return { id, name, type, created: true };
  };

  const desktop250 = await ensure({
    name: "Actrezz Watch Desktop 300x250",
    type: 2,
    size: "300x250",
    create: { size: "300x250", ...commonDisplaySettings },
    update: { size: "300x250", ...commonDisplaySettings },
  });
  const desktop500 = await ensure({
    name: "Actrezz Watch Desktop 300x500",
    type: 2,
    size: "300x500",
    create: { size: "300x500", ...commonDisplaySettings },
    update: { size: "300x500", ...commonDisplaySettings },
  });
  const desktopNative = await ensure({
    name: "Actrezz Watch Desktop Native",
    type: 20,
    create: { ...commonDisplaySettings, native_ad_configuration: desktopNativeConfiguration },
    update: { ...commonDisplaySettings, native_ad_configuration: desktopNativeConfiguration },
  });
  const mobile100 = await ensure({
    name: "Actrezz Watch Mobile 300x100",
    type: 10,
    size: "300x100",
    create: { size: "300x100", ...commonDisplaySettings },
    update: { size: "300x100", ...commonDisplaySettings },
  });
  const mobile250 = await ensure({
    name: "Actrezz Watch Mobile 300x250",
    type: 10,
    size: "300x250",
    create: { size: "300x250", ...commonDisplaySettings },
    update: { size: "300x250", ...commonDisplaySettings },
  });
  const mobileNative = await ensure({
    name: "Actrezz Watch Mobile Native",
    type: 20,
    create: { ...commonDisplaySettings, native_ad_configuration: mobileNativeConfiguration },
    update: { ...commonDisplaySettings, native_ad_configuration: mobileNativeConfiguration },
  });
  const footerOutstream = await ensure({
    name: "Actrezz Footer Outstream",
    type: 37,
    create: {
      marketing_tags: blockedMarketingTags,
      branding_enabled: 1,
      maximum_width: 720,
      cta_overlay_enabled: 1,
      fallback_ads: 1,
      is_responsive_zone: 1,
      enable_ad_transparency_dialog: 1,
    },
    update: {
      marketing_tags: blockedMarketingTags,
      branding_enabled: 1,
      maximum_width: 720,
      cta_overlay_enabled: 1,
      fallback_ads: 1,
      is_responsive_zone: 1,
      enable_ad_transparency_dialog: 1,
    },
  });

  const multi = async (name, childZones) => {
    const create = {
      ad_refresh_rate: 60,
      is_responsive_zone: 1,
      zones: childZones.map((zone) => ({
        id: zone.id,
        layout: zone.layout,
        name: zone.name,
        publisher_ad_type: zone.type,
      })),
    };
    const result = await ensure({ name, type: 38, create, update: create });
    const detail = await request(`/zones/${result.id}`, { sessionToken });
    const configured = zoneObject(detail.data);
    if (!Array.isArray(configured.zones) || configured.zones.length !== childZones.length) {
      if (result.created) {
        await request(`/zones/${result.id}`, { method: "DELETE", sessionToken });
        actions.push({ action: "rolled-back", id: result.id, label: `${name} (child association was not accepted)` });
      }
      throw new Error(`${name} child-zone association was not accepted by ExoClick API.`);
    }
    return result;
  };

  const desktopMulti = await multi("Actrezz Watch Desktop Multi-Format", [
    { ...desktop250, layout: 2 },
    { ...desktop500, layout: 1 },
    { ...desktopNative, layout: null },
  ]);
  const mobileMulti = await multi("Actrezz Watch Mobile Multi-Format", [
    { ...mobile100, layout: 1 },
    { ...mobile250, layout: 1 },
    { ...mobileNative, layout: null },
  ]);

  const snippets = {};
  for (const zone of [desktopMulti, mobileMulti, footerOutstream]) {
    const response = await request(`/zones/${zone.id}/snippet`, { sessionToken });
    snippets[zone.id] = safeErrorBody(response.data);
  }

  console.log(JSON.stringify({
    mode: "setup",
    site: { id: siteId, name: "Actrezz" },
    actions,
    result: {
      desktopMultiFormatZoneId: desktopMulti.id,
      mobileMultiFormatZoneId: mobileMulti.id,
      footerOutstreamZoneId: footerOutstream.id,
      providerUrl: "https://a.magsrv.com/ad-provider.js",
      blockedMarketingTags: ["Back Button Offer", "Misleading Branding", "High CTR Elements"],
      refreshSeconds: 60,
    },
    snippets,
  }, null, 2));
}

async function ensureFooterDisplayZones() {
  const sessionToken = await login();
  const siteId = 1112830;
  let zones = await getSiteZones(sessionToken, siteId);
  const ensure = async (name, publisherAdType, size) => {
    let zone = zones.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
    const settings = { name, size, ...commonDisplaySettings };
    if (zone) {
      await request(`/zones/${zone.id}`, { method: "PUT", sessionToken, body: settings });
    } else {
      const response = await request("/zones", {
        method: "POST",
        sessionToken,
        body: { active: 1, idsite: siteId, publisher_ad_type: publisherAdType, ...settings },
      });
      const id = createdZoneId(response.data);
      if (id) zone = { id };
      else {
        zones = await getSiteZones(sessionToken, siteId);
        zone = zones.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
      }
    }
    if (!zone?.id) throw new Error(`Could not resolve footer zone: ${name}`);
    const detail = await request(`/zones/${zone.id}`, { sessionToken });
    const configured = zoneObject(detail.data);
    return { id: Number(zone.id), name, size: configured.size, active: configured.active, refreshSeconds: configured.ad_refresh_rate };
  };

  const [desktop, mobile] = await Promise.all([
    ensure("Actrezz Footer Desktop 300x250", 2, "300x250"),
    ensure("Actrezz Footer Mobile 300x100", 10, "300x100"),
  ]);
  console.log(JSON.stringify({ mode: "ensure-footer-display", desktop, mobile }, null, 2));
}

async function ensureShortsReelBannerZones() {
  const sessionToken = await login();
  const siteId = 1112830;
  let zones = await getSiteZones(sessionToken, siteId);
  const ensure = async (name) => {
    let zone = zones.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
    const settings = { name, size: "300x100", ...commonDisplaySettings };
    if (zone) {
      await request(`/zones/${zone.id}`, { method: "PUT", sessionToken, body: settings });
    } else {
      const response = await request("/zones", { method: "POST", sessionToken, body: { active: 1, idsite: siteId, publisher_ad_type: 10, ...settings } });
      const id = createdZoneId(response.data);
      if (id) zone = { id };
      else {
        zones = await getSiteZones(sessionToken, siteId);
        zone = zones.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
      }
    }
    if (!zone?.id) throw new Error(`Could not resolve Shorts reel banner zone: ${name}`);
    const detail = await request(`/zones/${zone.id}`, { sessionToken });
    const configured = zoneObject(detail.data);
    return { id: Number(zone.id), name, size: configured.size, active: configured.active, refreshSeconds: configured.ad_refresh_rate };
  };
  const result = await Promise.all([1, 2, 3].map((number) => ensure(`Actrezz Shorts Reel Banner ${number}`)));
  console.log(JSON.stringify({
    mode: "ensure-shorts-reel-banner",
    zones: result,
    env: { EXOCLICK_SHORTS_REEL_BANNER_ZONE_IDS: result.map((zone) => zone.id).join(",") },
  }, null, 2));
}

async function ensureGridOutstreamZones() {
  const sessionToken = await login();
  const siteId = 1112830;
  let zones = await getSiteZones(sessionToken, siteId);
  const settings = {
    marketing_tags: blockedMarketingTags,
    branding_enabled: 1,
    maximum_width: 720,
    cta_overlay_enabled: 1,
    is_responsive_zone: 1,
    enable_ad_transparency_dialog: 1,
  };
  const ensure = async (name) => {
    let zone = zones.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
    if (zone) {
      await request(`/zones/${zone.id}`, { method: "PUT", sessionToken, body: { name, ...settings } });
    } else {
      const response = await request("/zones", {
        method: "POST",
        sessionToken,
        body: { active: 1, idsite: siteId, publisher_ad_type: 37, name, ...settings },
      });
      const id = createdZoneId(response.data);
      if (id) zone = { id };
      else {
        zones = await getSiteZones(sessionToken, siteId);
        zone = zones.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
      }
    }
    if (!zone?.id) throw new Error(`Could not resolve grid outstream zone: ${name}`);
    const [detail, snippet] = await Promise.all([
      request(`/zones/${zone.id}`, { sessionToken }),
      request(`/zones/${zone.id}/snippet`, { sessionToken }),
    ]);
    const configured = zoneObject(detail.data);
    return {
      id: Number(zone.id),
      name,
      active: configured.active,
      maximumWidth: configured.maximum_width,
      responsive: configured.is_responsive_zone,
      snippetClass: String(JSON.stringify(snippet.data).match(/class=\\"([^\\"]+)\\"/)?.[1] || ""),
    };
  };

  const result = await Promise.all([
    ensure("Actrezz Grid Outstream 1"),
    ensure("Actrezz Grid Outstream 2"),
  ]);
  console.log(JSON.stringify({
    mode: "ensure-grid-outstream",
    zones: result,
    envValue: result.map((zone) => zone.id).join(","),
  }, null, 2));
}

async function ensureGridDisplayZones() {
  const sessionToken = await login();
  const siteId = 1112830;
  let zones = await getSiteZones(sessionToken, siteId);
  const ensure = async (name, publisherAdType, size) => {
    let zone = zones.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
    const settings = { name, size, ...commonDisplaySettings };
    if (zone) {
      await request(`/zones/${zone.id}`, { method: "PUT", sessionToken, body: settings });
    } else {
      const response = await request("/zones", {
        method: "POST",
        sessionToken,
        body: { active: 1, idsite: siteId, publisher_ad_type: publisherAdType, ...settings },
      });
      const id = createdZoneId(response.data);
      if (id) zone = { id };
      else {
        zones = await getSiteZones(sessionToken, siteId);
        zone = zones.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
      }
    }
    if (!zone?.id) throw new Error(`Could not resolve grid display zone: ${name}`);
    const [detail, snippet] = await Promise.all([
      request(`/zones/${zone.id}`, { sessionToken }),
      request(`/zones/${zone.id}/snippet`, { sessionToken }),
    ]);
    const configured = zoneObject(detail.data);
    return {
      id: Number(zone.id),
      name,
      size: configured.size,
      active: configured.active,
      refreshSeconds: configured.ad_refresh_rate,
      snippetClass: String(JSON.stringify(snippet.data).match(/class=\\"([^\\"]+)\\"/)?.[1] || ""),
    };
  };

  const [desktop1, desktop2, mobile1, mobile2] = await Promise.all([
    ensure("Actrezz Grid Desktop 300x250 1", 2, "300x250"),
    ensure("Actrezz Grid Desktop 300x250 2", 2, "300x250"),
    ensure("Actrezz Grid Mobile 300x250 1", 10, "300x250"),
    ensure("Actrezz Grid Mobile 300x250 2", 10, "300x250"),
  ]);
  console.log(JSON.stringify({
    mode: "ensure-grid-display",
    desktop: [desktop1, desktop2],
    mobile: [mobile1, mobile2],
    env: {
      EXOCLICK_GRID_DESKTOP_ZONE_IDS: [desktop1.id, desktop2.id].join(","),
      EXOCLICK_GRID_MOBILE_ZONE_IDS: [mobile1.id, mobile2.id].join(","),
    },
  }, null, 2));
}

async function ensureGridNativeZones() {
  const sessionToken = await login();
  const siteId = 1112830;
  const prefix = String(process.env.EXOCLICK_GRID_NATIVE_ZONE_PREFIX || "Actrezz Grid Native").trim();
  if (!prefix) throw new Error("EXOCLICK_GRID_NATIVE_ZONE_PREFIX cannot be empty.");
  let zones = await getSiteZones(sessionToken, siteId);
  const settings = {
    ...commonDisplaySettings,
    native_ad_configuration: gridNativeConfiguration,
  };
  const ensure = async (name) => {
    let zone = zones.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
    if (zone) {
      await request(`/zones/${zone.id}`, { method: "PUT", sessionToken, body: { name, ...settings } });
    } else {
      const response = await request("/zones", {
        method: "POST",
        sessionToken,
        body: { active: 1, idsite: siteId, publisher_ad_type: 20, name, ...settings },
      });
      const id = createdZoneId(response.data);
      if (id) zone = { id };
      else {
        zones = await getSiteZones(sessionToken, siteId);
        zone = zones.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
      }
    }
    if (!zone?.id) throw new Error(`Could not resolve grid native zone: ${name}`);
    const [detail, snippet] = await Promise.all([
      request(`/zones/${zone.id}`, { sessionToken }),
      request(`/zones/${zone.id}/snippet`, { sessionToken }),
    ]);
    const configured = zoneObject(detail.data);
    return {
      id: Number(zone.id),
      name,
      active: configured.active,
      refreshSeconds: configured.ad_refresh_rate,
      snippetClass: String(JSON.stringify(snippet.data).match(/class=\\"([^\\"]+)\\"/)?.[1] || ""),
    };
  };

  const result = await Promise.all([
    ensure(`${prefix} 1`),
    ensure(`${prefix} 2`),
    ensure(`${prefix} 3`),
  ]);
  console.log(JSON.stringify({
    mode: "ensure-grid-native",
    zones: result,
    env: { EXOCLICK_GRID_NATIVE_ZONE_IDS: result.map((zone) => zone.id).join(",") },
  }, null, 2));
}

if (mode === "audit") {
  await audit();
} else if (mode === "details") {
  await details();
} else if (mode === "stats") {
  await publisherStats();
} else if (mode === "discover") {
  await discover();
} else if (mode === "schema") {
  await schema();
} else if (mode === "schema-summary") {
  await schemaSummary();
} else if (mode === "collections") {
  await collections();
} else if (mode === "templates") {
  await templates();
} else if (mode === "find-multi-format-schema") {
  await findMultiFormatSchema();
} else if (mode === "sync-popunders") {
  await syncPopunders();
} else if (mode === "sync-footer-outstream") {
  await syncFooterOutstream();
} else if (mode === "setup") {
  await setup();
} else if (mode === "ensure-footer-display") {
  await ensureFooterDisplayZones();
} else if (mode === "ensure-shorts-reel-banner") {
  await ensureShortsReelBannerZones();
} else if (mode === "ensure-grid-outstream") {
  await ensureGridOutstreamZones();
} else if (mode === "ensure-grid-display") {
  await ensureGridDisplayZones();
} else if (mode === "ensure-grid-native") {
  await ensureGridNativeZones();
} else {
  throw new Error(`Unknown mode: ${mode}. Supported modes: audit, details, stats, discover, schema, schema-summary, collections, templates, find-multi-format-schema, sync-popunders, sync-footer-outstream, setup, ensure-footer-display, ensure-shorts-reel-banner, ensure-grid-outstream, ensure-grid-display, ensure-grid-native.`);
}
