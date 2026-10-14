import nextEnv from "@next/env";
import { writeFile, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

nextEnv.loadEnvConfig(process.cwd());
const env = process.env;
const account = env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID || env.cloudflare_account_id;
const tokenCandidates = [
  env.CLOUDFLARE_DEPLOY_TOKEN,
  env.CLOUDFLARE_API_TOKEN,
  env.CLOUDFLARE_ACCESS_TOKEN,
  env.CLOUDFLARE_ANALYTICS_TOKEN,
  env.cloudflare_access_token,
].filter(Boolean);
const bucket = env.R2_BUCKET_NAME || "actrezz-media";
const command = (process.argv[2] || "inspect").trim().toLowerCase();
console.log(`Cloudflare project command: ${command}`);
if (!account || !tokenCandidates.length) throw new Error("Cloudflare credentials are missing.");

async function activeCloudflareToken() {
  for (const candidate of [...new Set(tokenCandidates)]) {
    try {
      const response = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
        headers: { Authorization: `Bearer ${candidate}` },
        signal: AbortSignal.timeout(10_000),
      });
      const result = await response.json();
      if (response.ok && result.success && result.result?.status === "active") return candidate;
    } catch {
      // Try the next configured token without logging token details.
    }
  }
  throw new Error("No active Cloudflare deploy token is configured.");
}

const token = await activeCloudflareToken();

const configuredSiteUrl = (env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online").replace(/\/+$/, "");
const configuredMediaUrl = (env.NEXT_PUBLIC_MEDIA_URL || "").replace(/\/+$/, "");
const siteHost = new URL(configuredSiteUrl).hostname;
const apexDomain = siteHost.startsWith("www.") ? siteHost.slice(4) : siteHost;
const usingCustomSiteDomain = !siteHost.endsWith(".workers.dev") && !siteHost.includes("localhost");

async function patchPrismaWorkerBundle() {
  const handler = new URL("../.open-next/server-functions/default/handler.mjs", import.meta.url);
  let source = await readFile(handler, "utf8");
  const wasmImport = 'import prismaQueryCompilerWasmModule from "./node_modules/.prisma/client/query_compiler_bg.wasm";\n';
  const dynamicLoader = 'config.compilerWasm={getRuntime:async()=>require_query_compiler_bg(),getQueryCompilerWasmModule:async()=>{let queryCompilerWasmFilePath=require("path").join(config.dirname,"query_compiler_bg.wasm"),queryCompilerWasmFileBytes=require("fs").readFileSync(queryCompilerWasmFilePath);return new WebAssembly.Module(queryCompilerWasmFileBytes)}};';
  const fsUrlLoader = 'config.compilerWasm={getRuntime:async()=>require_query_compiler_bg(),getQueryCompilerWasmModule:async()=>{let queryCompilerWasmFileBytes=require("fs").readFileSync(new URL("./node_modules/.prisma/client/query_compiler_bg.wasm",import.meta.url));return new WebAssembly.Module(queryCompilerWasmFileBytes)}};';
  const moduleLoader = 'config.compilerWasm={getRuntime:async()=>require_query_compiler_bg(),getQueryCompilerWasmModule:async()=>prismaQueryCompilerWasmModule};';
  if (source.includes(dynamicLoader)) {
    source = source.replace(dynamicLoader, moduleLoader);
    if (!source.includes(wasmImport)) source = wasmImport + source;
    await writeFile(handler, source);
    console.log("Patched Prisma Worker WASM loader.");
    return;
  }
  if (source.includes(fsUrlLoader)) {
    source = source.replace(fsUrlLoader, moduleLoader);
    if (!source.includes(wasmImport)) source = wasmImport + source;
    await writeFile(handler, source);
    console.log("Patched Prisma Worker WASM loader.");
    return;
  }
  if (source.includes(moduleLoader)) {
    if (!source.includes(wasmImport)) await writeFile(handler, wasmImport + source);
    console.log("Prisma Worker WASM loader already patched.");
    return;
  }
  throw new Error("Could not find Prisma Worker WASM loader in the OpenNext bundle.");
}

async function api(path, method = "GET", body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(`Cloudflare ${method} ${path} failed (${response.status}): ${(data.errors || []).map((e) => e.message).join("; ")}`);
  return data.result;
}

async function cloudflare(path, method = "GET", body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(`Cloudflare ${method} ${path} failed (${response.status}): ${(data.errors || []).map((e) => e.message).join("; ")}`);
  return data.result;
}

async function ensureZone(shouldCreate) {
  if (!usingCustomSiteDomain) return null;
  const zones = await cloudflare(`/zones?name=${encodeURIComponent(apexDomain)}`);
  let zone = zones[0];
  if (!zone && shouldCreate) {
    zone = await cloudflare("/zones", "POST", { account: { id: account }, name: apexDomain, type: "full" });
  }
  if (!zone) return null;
  return {
    id: zone.id,
    name: zone.name,
    status: zone.status,
    nameServers: zone.name_servers || [],
  };
}

function run(args, overrides, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env: { ...env, NPM_CONFIG_PREFIX: "C:\\Program Files\\nodejs", CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_DEPLOY_TOKEN: token, ...overrides }, windowsHide: true, stdio: ["pipe", "inherit", "inherit"] });
    child.stdin.end(input);
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Build/deploy command exited ${code}`)));
  });
}

try {
  const subdomain = await api("/workers/subdomain");
  const media = await api(`/r2/buckets/${bucket}/domains/managed`);
  const workersDevUrl = `https://actrezz.${subdomain.subdomain}.workers.dev`;
  const zone = await ensureZone(["prepare", "deploy"].includes(command));
  const siteUrl = usingCustomSiteDomain ? configuredSiteUrl : workersDevUrl;
  const mediaUrl = configuredMediaUrl || `https://${media.domain}`;
  if (command === "prepare") {
    const buckets = await api("/r2/buckets");
    if (!buckets.buckets.some((b) => b.name === "actrezz-next-cache")) await api("/r2/buckets", "POST", { name: "actrezz-next-cache", storageClass: "Standard" });
    if (!media.enabled) await api(`/r2/buckets/${bucket}/domains/managed`, "PUT", { enabled: true });
    let existing = { rules: [] };
    try { existing = await api(`/r2/buckets/${bucket}/cors`); } catch (error) { if (!error.message.includes("404")) throw error; }
    const allowedOrigins = Array.from(new Set([siteUrl, workersDevUrl, "http://localhost:3000", "http://127.0.0.1:3000"]));
    const rule = { id: "actrezz-browser-media", allowed: { origins: allowedOrigins, methods: ["GET", "HEAD", "PUT"], headers: ["Content-Type", "Cache-Control", "Range"] }, exposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"], maxAgeSeconds: 3600 };
    await api(`/r2/buckets/${bucket}/cors`, "PUT", { rules: [...(existing.rules || []).filter((r) => r.id !== rule.id), rule] });
  }
  const info = { siteUrl, workersDevUrl, mediaUrl, mediaEnabled: command === "prepare" || media.enabled, indexingEnabled: usingCustomSiteDomain, customDomainConnected: usingCustomSiteDomain, zone };
  await writeFile(new URL("../docs/DEPLOYMENT-INFO.json", import.meta.url), JSON.stringify(info, null, 2) + "\n");
  console.log(JSON.stringify(info, null, 2));
  const overrides = { NEXT_PUBLIC_SITE_URL: siteUrl, NEXT_PUBLIC_MEDIA_URL: mediaUrl, SITE_INDEXING_ENABLED: usingCustomSiteDomain ? "true" : "false", PUBLIC_CATALOG_SOURCE: "db", NEXT_TELEMETRY_DISABLED: "1" };
  if (["build", "deploy"].includes(command)) {
    if (!info.mediaEnabled) throw new Error("Enable the R2 test endpoint with the prepare command first.");
    if ((env.ADMIN_PASSWORD || "").length < 12 || (env.ADMIN_SESSION_SECRET || "").length < 32) throw new Error("Production admin credentials do not meet the configured requirements.");
    await run(["scripts/export-public-snapshot.mjs"], overrides);
    // OpenNext 1.20 + Next 16 may return after compiling only its config when
    // invoked directly from a Node child process. Build Next explicitly, then
    // package that verified output as the Worker.
    await run(["node_modules/next/dist/bin/next", "build"], overrides);
    await run(["node_modules/@opennextjs/cloudflare/dist/cli/index.js", "build", "--skipNextBuild"], overrides);
    // OpenNext keeps external Prisma packages in the server bundle. With
    // Prisma's client engine, the generated default entry can still resolve
    // the Node filesystem loader instead of the Worker WASM loader. Point the
    // bundled generated client at its WASM entry explicitly; local Next builds
    // and scripts continue to use the normal Node entry.
    const prismaDefault = new URL("../.open-next/server-functions/default/node_modules/.prisma/client/default.js", import.meta.url);
    try { await readFile(prismaDefault); await writeFile(prismaDefault, "module.exports = require('./wasm.js');\n"); } catch { /* Bundle layout changed; leave the generated output untouched. */ }
    const prismaIndex = new URL("../.open-next/server-functions/default/node_modules/.prisma/client/index.js", import.meta.url);
    try { await readFile(prismaIndex); await writeFile(prismaIndex, "module.exports = require('./wasm.js');\n"); } catch { /* Bundle layout changed; leave the generated output untouched. */ }
    const prismaPackageDefault = new URL("../.open-next/server-functions/default/node_modules/@prisma/client/default.js", import.meta.url);
    try { await readFile(prismaPackageDefault); await writeFile(prismaPackageDefault, "module.exports = require('../../.prisma/client/wasm.js');\n"); } catch { /* Generated package may be deduplicated. */ }
    await patchPrismaWorkerBundle();
  }
  if (command === "deploy") {
    await run(["node_modules/@opennextjs/cloudflare/dist/cli/index.js", "deploy"], overrides);
    // The generated catalogue is an emergency fallback only.  Keeping the
    // primary public read path on Postgres avoids loading the 11+ MB snapshot
    // in every Worker isolate as the catalogue grows.
    const secrets = { DATABASE_URL: env.DATABASE_URL, DIRECT_URL: env.DIRECT_URL, ADMIN_EMAIL: env.ADMIN_EMAIL, ADMIN_PASSWORD: env.ADMIN_PASSWORD, ADMIN_SESSION_SECRET: env.ADMIN_SESSION_SECRET, PUBLIC_CATALOG_SOURCE: "db", R2_BUCKET_NAME: bucket,
      R2_ENDPOINT: env.R2_ENDPOINT || env.s3_api_endpoint, R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID || env.access_key_id, R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY || env.secret_access_key,
      NEXT_PUBLIC_SITE_URL: siteUrl, NEXT_PUBLIC_MEDIA_URL: mediaUrl };
    for (const key of ["ADMIN_REFRESH_SECRET", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_MODEL"]) {
      if (env[key]) secrets[key] = env[key];
    }
    for (const key of ["DMCA_RECIPIENT_EMAIL", "DMCA_FROM_EMAIL", "EXOCLICK_INSTREAM_VAST_URL", "EXOCLICK_PAUSE_DESKTOP_VAST_URL", "EXOCLICK_PAUSE_MOBILE_VAST_URL", "EXOCLICK_SHORTS_VAST_URL", "EXOCLICK_POPUNDER_ZONE_ID", "EXOCLICK_POPUNDER_DESKTOP_ZONE_ID", "EXOCLICK_POPUNDER_MOBILE_ZONE_ID", "EXOCLICK_POPUNDER_SCRIPT_URL", "EXOCLICK_POPUNDER_FREQUENCY_PERIOD", "EXOCLICK_POPUNDER_FREQUENCY_COUNT", "EXOCLICK_POPUNDER_TRIGGER_METHOD", "EXOCLICK_POPUNDER_TRIGGER_DELAY", "EXOCLICK_AD_PROVIDER_URL", "EXOCLICK_OUTSTREAM_PROVIDER_URL", "EXOCLICK_WATCH_NTV_ZONE_ID", "EXOCLICK_WATCH_MOBILE_ZONE_ID", "EXOCLICK_WATCH_DESKTOP_TOP_ZONE_ID", "EXOCLICK_WATCH_DESKTOP_BOTTOM_ZONE_ID", "EXOCLICK_WATCH_MOBILE_BANNER_ZONE_ID", "EXOCLICK_FOOTER_OUTSTREAM_ZONE_ID", "EXOCLICK_GRID_OUTSTREAM_ZONE_IDS", "EXOCLICK_GRID_DESKTOP_ZONE_IDS", "EXOCLICK_GRID_MOBILE_ZONE_IDS", "EXOCLICK_GRID_NATIVE_ZONE_IDS", "EXOCLICK_CATALOGUE_NATIVE_ZONE_IDS", "EXOCLICK_RELATED_NATIVE_ZONE_IDS", "EXOCLICK_ACTRESS_NATIVE_ZONE_IDS", "EXOCLICK_YEAR_NATIVE_ZONE_IDS", "EXOCLICK_MOVIE_NATIVE_ZONE_IDS", "EXOCLICK_TV_SERIES_NATIVE_ZONE_IDS", "EXOCLICK_TAG_NATIVE_ZONE_IDS", "EXOCLICK_FOOTER_DESKTOP_ZONE_ID", "EXOCLICK_FOOTER_MOBILE_ZONE_ID", "EXOCLICK_FULLPAGE_MOBILE_ZONE_ID", "EXOCLICK_FULLPAGE_DESKTOP_ZONE_ID", "EXOCLICK_NEVERBLOCK_ENABLED"]) {
      if (env[key]) secrets[key] = env[key];
    }
    if (Object.values(secrets).some((value) => !value)) throw new Error("A required runtime secret is missing.");
    await run(["node_modules/wrangler/bin/wrangler.js", "secret", "bulk"], overrides, JSON.stringify(secrets));
    console.log("Runtime secrets installed. Values were not printed.");
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
