import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";
import { spawn } from "node:child_process";

const appRoot = process.cwd();
const projectRoot = path.resolve(appRoot, "..");
const catalogPath = path.join(appRoot, "src", "lib", "youtube", "local-catalog.generated.json");
const downloadsRoot = process.env.ACTREZZ_IMPORT_DOWNLOADS_DIR
  ? path.resolve(process.env.ACTREZZ_IMPORT_DOWNLOADS_DIR)
  : path.join(projectRoot, "downloads");
const mediaRoot = path.join(projectRoot, "media");
const envPath = path.join(appRoot, ".env.local");

function parseArgs(argv) {
  const args = {
    profiles: false,
    thumbnails: false,
    videos: false,
    shortiesThumbnails: false,
    shortiesVideos: false,
    audit: false,
    dryRun: false,
    force: false,
    verbose: false,
    concurrency: 3,
    retries: 3,
    limit: 0,
    part: "",
    deltaOnly: false,
    deltaDir: "",
    wrangler: false,
  };

  for (const raw of argv) {
    const [name, value = ""] = raw.split("=", 2);
    if (name === "--profiles") args.profiles = true;
    else if (name === "--thumbnails") args.thumbnails = true;
    else if (name === "--videos") args.videos = true;
    else if (name === "--shorties-thumbnails") args.shortiesThumbnails = true;
    else if (name === "--shorties-videos") args.shortiesVideos = true;
    else if (name === "--all") {
      args.profiles = true;
      args.thumbnails = true;
      args.videos = true;
    } else if (name === "--audit") args.audit = true;
    else if (name === "--delta-only") args.deltaOnly = true;
    else if (name === "--delta-dir") args.deltaDir = value;
    else if (name === "--wrangler") args.wrangler = true;
    else if (name === "--dry-run") args.dryRun = true;
    else if (name === "--force") args.force = true;
    else if (name === "--verbose") args.verbose = true;
    else if (name === "--concurrency") args.concurrency = Math.max(1, Math.min(Number(value) || 3, 12));
    else if (name === "--retries") args.retries = Math.max(0, Math.min(Number(value) || 0, 8));
    else if (name === "--limit") args.limit = Math.max(0, Number(value) || 0);
    else if (name === "--part") args.part = normalizePart(value);
    else if (name === "--help" || name === "-h") args.help = true;
    else {
      console.error(`Unknown option: ${raw}`);
      args.help = true;
    }
  }

  return args;
}

function normalizePart(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean) return "";
  const numberMatch = clean.match(/^\d+$/);
  if (numberMatch) return `part_${clean.padStart(2, "0")}`;
  const partMatch = clean.match(/^part[_-]?(\d+)$/);
  if (partMatch) return `part_${partMatch[1].padStart(2, "0")}`;
  return clean.replace(/\\/g, "/");
}

function printHelp() {
  console.log(`
Usage:
  node scripts/upload-r2-media.mjs --profiles --thumbnails --audit
  node scripts/upload-r2-media.mjs --profiles --thumbnails --concurrency=6
  node scripts/upload-r2-media.mjs --videos --part=1 --concurrency=2
  node scripts/upload-r2-media.mjs --shorties-thumbnails --concurrency=6
  node scripts/upload-r2-media.mjs --shorties-videos --concurrency=2
  node scripts/upload-r2-media.mjs --videos --limit=3 --dry-run

Options:
  --profiles        Upload actress profile images to actresses/<slug>/profile.webp
  --thumbnails      Upload video thumbnails to thumbnails/<videoId>.webp
  --videos          Upload videos to videos/<videoId>.mp4
  --shorties-thumbnails  Upload generated Shorties posters to shorties/thumbnails/<sourceId>.webp
  --shorties-videos      Upload Shorties MP4s to shorties/videos/<sourceId>.mp4
  --all             Include profiles, thumbnails, and videos
  --part=1          Videos only: filter downloads/part_01, part_02, etc.
  --delta-only      Include only the prepared celeb delta
  --audit           Check R2 existence only; do not upload
  --dry-run         Build the upload list only; do not touch R2 unless --audit is also set
  --force           Upload even if the object already exists
  --limit=3         Process only the first N matched files
  --concurrency=2   Parallel uploads/checks, max 12
  --retries=3       Retry failed R2 requests
  --verbose         Print every skipped/existing object
`);
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    out[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const cli = parseArgs(process.argv.slice(2));
if (cli.help || (!cli.profiles && !cli.thumbnails && !cli.videos && !cli.shortiesThumbnails && !cli.shortiesVideos)) {
  printHelp();
  process.exit(cli.help ? 0 : 1);
}

const env = { ...parseEnvFile(envPath), ...process.env };
const deltaPath = cli.deltaDir
  ? path.resolve(cli.deltaDir, "database-seed.delta.json")
  : path.join(projectRoot, "data", "celeb-import", "database-seed.delta.json");

function envValue(...names) {
  for (const name of names) {
    const value = env[name];
    if (value?.trim()) return value.trim();
  }
  return "";
}

const endpoint = envValue("R2_ENDPOINT", "S3_API_ENDPOINT", "s3_api_endpoint").replace(/\/+$/, "");
const accessKeyId = envValue("R2_ACCESS_KEY_ID", "access_key_id");
const secretAccessKey = envValue("R2_SECRET_ACCESS_KEY", "secret_access_key");
const bucket = envValue("R2_BUCKET_NAME") || "actrezz-media";
const publicMediaUrl = envValue("NEXT_PUBLIC_MEDIA_URL").replace(/\/+$/, "");
const shouldUseR2 = (cli.audit || !cli.dryRun) && !cli.wrangler;

if (shouldUseR2 && (!endpoint || !accessKeyId || !secretAccessKey)) {
  console.error("Missing R2 credentials. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in .env.local.");
  process.exit(1);
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKeyPath(key) {
  return key.split("/").map(encodePathSegment).join("/");
}

function awsDates(date = new Date()) {
  const iso = date.toISOString();
  const dateStamp = iso.slice(0, 10).replace(/-/g, "");
  return {
    dateStamp,
    amzDate: `${dateStamp}T${iso.slice(11, 19).replace(/:/g, "")}Z`,
  };
}

function signedHeaders(method, key) {
  const endpointUrl = new URL(endpoint);
  const { dateStamp, amzDate } = awsDates();
  const canonicalUri = `/${bucket}/${encodeKeyPath(key)}`;
  const host = endpointUrl.host;
  const headersForSignature = {
    host,
    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    "x-amz-date": amzDate,
  };
  const signedHeaderNames = Object.keys(headersForSignature).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headersForSignature[name].replace(/\s+/g, " ").trim()}\n`)
    .join("");
  const signedHeaderList = signedHeaderNames.join(";");
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaderList,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), "auto"), "s3"), "aws4_request");
  const signature = hmac(signingKey, stringToSign, "hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderList}, Signature=${signature}`;

  return {
    url: `${endpointUrl.origin}${canonicalUri}`,
    headers: {
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      "x-amz-date": amzDate,
      Authorization: authorization,
    },
  };
}

async function headObject(entry) {
  const { url, headers } = signedHeaders("HEAD", entry.key);
  const response = await fetch(url, { method: "HEAD", headers });
  if (response.ok) return true;
  if (response.status === 404) return false;
  throw new Error(`HEAD ${entry.key} failed: ${response.status} ${response.statusText}`);
}

async function putObject(entry) {
  const { url, headers } = signedHeaders("PUT", entry.key);
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": entry.contentType,
      "Content-Length": String(entry.size),
      "Cache-Control": entry.cacheControl,
    },
    body: fs.createReadStream(entry.sourcePath),
    duplex: "half",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`PUT ${entry.key} failed: ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 300)}` : ""}`);
  }
}

async function putObjectWithWrangler(entry) {
  const args = [
    "wrangler", "r2", "object", "put", `${bucket}/${entry.key}`,
    "--file", entry.sourcePath,
    "--content-type", entry.contentType,
    "--cache-control", entry.cacheControl,
    "--remote",
  ];
  await new Promise((resolve, reject) => {
    const localWrangler = path.join(appRoot, "node_modules", "wrangler", "bin", "wrangler.js");
    const isWindows = process.platform === "win32";
    const command = fs.existsSync(localWrangler) ? process.execPath : isWindows ? process.execPath : "npx";
    const commandArgs = fs.existsSync(localWrangler)
      ? [localWrangler, ...args.slice(1)]
      : isWindows
        ? [path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"), ...args]
        : args;
    const child = spawn(command, commandArgs, {
      cwd: appRoot,
      env: process.env,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`Wrangler upload ${entry.key} failed (${code}): ${error.slice(-500)}`)));
  });
}

function contentTypeFor(filePath, fallback) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".avif") return "image/avif";
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  return fallback;
}

async function readCatalog() {
  const raw = await fsp.readFile(catalogPath, "utf8");
  return JSON.parse(raw);
}

function buildEntries(catalog) {
  const entries = [];
  const videos = Array.isArray(catalog.videos) ? catalog.videos : [];
  const actresses = Array.isArray(catalog.actresses) ? catalog.actresses : [];
  const delta = cli.deltaOnly ? JSON.parse(fs.readFileSync(deltaPath, "utf8")) : null;
  const deltaVideoIds = new Set(delta?.videos?.map((item) => item.id) || []);
  const deltaActressSlugs = new Set(delta?.actresses?.map((item) => item.slug) || []);

  if (cli.profiles) {
    for (const actress of actresses) {
      if (cli.deltaOnly && !deltaActressSlugs.has(actress.slug)) continue;
      if (!actress.profileImageSlug) continue;
      const sourcePath = path.join(mediaRoot, "actresses", actress.profileImageSlug, "profile.webp");
      entries.push({
        type: "profile",
        id: actress.id,
        title: actress.name,
        sourcePath,
        key: `actresses/${actress.profileImageSlug}/profile.webp`,
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
      });
    }
  }

  if (cli.thumbnails) {
    for (const video of videos) {
      if (cli.deltaOnly && !deltaVideoIds.has(video.id)) continue;
      const sourcePath = path.join(mediaRoot, "thumbnails", `${video.id}.webp`);
      entries.push({
        type: "thumbnail",
        id: video.id,
        title: video.title,
        sourcePath,
        key: `thumbnails/${video.id}.webp`,
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
      });
    }
  }

  if (cli.videos) {
    for (const video of videos) {
      if (cli.deltaOnly && !deltaVideoIds.has(video.id)) continue;
      const relativePath = String(video.relativePath || "").replace(/\\/g, "/");
      if (cli.part && !(
        relativePath.startsWith(`${cli.part}/`)
        || relativePath.includes(`/${cli.part}/`)
      )) continue;
      const directSourcePath = path.join(downloadsRoot, relativePath);
      // Import Studio accepts either downloads/part_XX or
      // downloads/celeb/part_XX. The delta stores paths relative to the folder
      // selected in the studio, so prefer the direct path and transparently
      // fall back to the nested celeb batch when this CLI is run on its own.
      const nestedCelebSourcePath = path.join(downloadsRoot, "celeb", relativePath);
      const sourcePath = fs.existsSync(directSourcePath) || !fs.existsSync(nestedCelebSourcePath)
        ? directSourcePath
        : nestedCelebSourcePath;
      entries.push({
        type: "video",
        id: video.id,
        title: video.title,
        sourcePath,
        key: `videos/${video.id}.mp4`,
        contentType: contentTypeFor(sourcePath, "video/mp4"),
        cacheControl: "public, max-age=31536000, immutable",
      });
    }
  }

  // Shorties are deliberately kept under their own stable R2 prefix. This
  // prevents a source numeric ID ever colliding with the main catalogue and
  // lets the database import verify media before a Short becomes public.
  if (cli.shortiesThumbnails) {
    const shortiesThumbnailRoot = path.join(projectRoot, "shorties", "thumbnails");
    if (fs.existsSync(shortiesThumbnailRoot)) {
      for (const file of fs.readdirSync(shortiesThumbnailRoot)) {
        const match = /^(\d+)\.webp$/i.exec(file);
        if (!match) continue;
        const sourcePath = path.join(shortiesThumbnailRoot, file);
        entries.push({
          type: "shorties-thumbnail",
          id: match[1],
          title: `Shorties ${match[1]} thumbnail`,
          sourcePath,
          key: `shorties/thumbnails/${match[1]}.webp`,
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000, immutable",
        });
      }
    }
  }

  if (cli.shortiesVideos) {
    const shortiesDownloadsRoot = path.join(projectRoot, "shorties", "downloads");
    const walk = (directory) => {
      if (!fs.existsSync(directory)) return;
      for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
        const candidate = path.join(directory, item.name);
        if (item.isDirectory()) walk(candidate);
        const match = item.isFile() && /^usersporn-(\d+)-720p\.mp4$/i.exec(item.name);
        if (!match) continue;
        entries.push({
          type: "shorties-video",
          id: match[1],
          title: `Shorties ${match[1]} video`,
          sourcePath: candidate,
          key: `shorties/videos/${match[1]}.mp4`,
          contentType: "video/mp4",
          cacheControl: "public, max-age=31536000, immutable",
        });
      }
    };
    walk(shortiesDownloadsRoot);
  }

  const unique = new Map();
  for (const entry of entries) {
    if (!unique.has(entry.key)) unique.set(entry.key, entry);
  }
  const deduped = [...unique.values()];
  return cli.limit ? deduped.slice(0, cli.limit) : deduped;
}

function formatBytes(value) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(label, fn) {
  let lastError;
  for (let attempt = 0; attempt <= cli.retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === cli.retries) break;
      const delay = Math.min(10000, 1000 * 2 ** attempt);
      if (cli.verbose) console.warn(`${label} retry ${attempt + 1}/${cli.retries} after ${delay}ms: ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function localInfo(entry) {
  try {
    const stat = await fsp.stat(entry.sourcePath);
    if (!stat.isFile()) return null;
    return stat;
  } catch {
    return null;
  }
}

async function main() {
  const catalog = await readCatalog();
  const entries = buildEntries(catalog);
  const stats = {
    total: entries.length,
    localMissing: 0,
    remoteExisting: 0,
    remoteMissing: 0,
    wouldUpload: 0,
    uploaded: 0,
    failed: 0,
    bytesPlanned: 0,
    bytesUploaded: 0,
  };
  const failures = [];
  let processed = 0;
  let nextIndex = 0;

  console.log(`Bucket: ${bucket}`);
  if (publicMediaUrl) console.log(`Public media URL: ${publicMediaUrl}`);
  console.log(`Mode: ${cli.audit ? "audit" : cli.dryRun ? "dry-run" : cli.wrangler ? "Wrangler upload" : cli.force ? "upload overwrite" : "upload missing only"}`);
  console.log(`Matched files: ${entries.length}${cli.part ? ` (${cli.part})` : ""}${cli.deltaOnly ? " (celeb delta only)" : ""}`);

  async function processEntry(entry) {
    const info = await localInfo(entry);
    processed += 1;
    if (!info) {
      stats.localMissing += 1;
      console.warn(`[${processed}/${stats.total}] missing local file: ${entry.sourcePath}`);
      return;
    }

    entry.size = info.size;
    stats.bytesPlanned += info.size;

    if (cli.dryRun && !cli.audit) {
      stats.wouldUpload += 1;
      if (cli.verbose) console.log(`[${processed}/${stats.total}] would upload ${entry.key} (${formatBytes(info.size)})`);
      return;
    }

    if (cli.wrangler) {
      try {
        stats.remoteMissing += 1;
        await withRetries(`Wrangler PUT ${entry.key}`, () => putObjectWithWrangler(entry));
        stats.uploaded += 1;
        stats.bytesUploaded += info.size;
        if (stats.uploaded % 25 === 0 || stats.uploaded === stats.total) {
          console.log(`[${processed}/${stats.total}] uploaded ${stats.uploaded} assets (${formatBytes(stats.bytesUploaded)})`);
        }
      } catch (error) {
        stats.failed += 1;
        failures.push({ key: entry.key, message: error.message });
        console.error(`[${processed}/${stats.total}] failed ${entry.key}: ${error.message}`);
      }
      return;
    }

    try {
      let exists = false;
      if (!cli.force || cli.audit) {
        exists = await withRetries(`HEAD ${entry.key}`, () => headObject(entry));
      }

      if (exists) {
        stats.remoteExisting += 1;
        if (cli.verbose) console.log(`[${processed}/${stats.total}] exists ${entry.key}`);
        return;
      }

      stats.remoteMissing += 1;
      if (cli.audit) {
        if (cli.verbose) console.log(`[${processed}/${stats.total}] missing on R2 ${entry.key}`);
        return;
      }

      await withRetries(`PUT ${entry.key}`, () => putObject(entry));
      stats.uploaded += 1;
      stats.bytesUploaded += info.size;
      console.log(`[${processed}/${stats.total}] uploaded ${entry.key} (${formatBytes(info.size)})`);
    } catch (error) {
      stats.failed += 1;
      failures.push({ key: entry.key, message: error.message });
      console.error(`[${processed}/${stats.total}] failed ${entry.key}: ${error.message}`);
    }
  }

  async function worker() {
    while (nextIndex < entries.length) {
      const entry = entries[nextIndex];
      nextIndex += 1;
      await processEntry(entry);
    }
  }

  await Promise.all(Array.from({ length: Math.min(cli.concurrency, entries.length) }, () => worker()));

  console.log("");
  console.log("Summary");
  console.log(`  Local files matched: ${stats.total}`);
  console.log(`  Local missing: ${stats.localMissing}`);
  console.log(`  Remote existing: ${stats.remoteExisting}`);
  console.log(`  Remote missing: ${stats.remoteMissing}`);
  console.log(`  Would upload: ${stats.wouldUpload}`);
  console.log(`  Uploaded: ${stats.uploaded}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Planned size: ${formatBytes(stats.bytesPlanned)}`);
  console.log(`  Uploaded size: ${formatBytes(stats.bytesUploaded)}`);

  if (failures.length) {
    console.log("");
    console.log("Failures");
    for (const failure of failures.slice(0, 25)) console.log(`  ${failure.key}: ${failure.message}`);
    if (failures.length > 25) console.log(`  ...${failures.length - 25} more`);
    process.exitCode = 1;
  }

  if (!publicMediaUrl) {
    console.log("");
    console.log("Note: NEXT_PUBLIC_MEDIA_URL is empty, so uploads can complete but production pages will not know the public media host yet.");
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
