#!/usr/bin/env node

/**
 * Download recent public VIDEO posts from an X/Twitter account for Shorts.
 *
 * This deliberately uses X's public syndication page, not an API key. X only
 * exposes a recent public timeline window through that page; it does not
 * provide authenticated-pagination replacement. Re-run periodically to keep
 * the local archive current. Image-only posts are ignored.
 *
 * Use only with media you own or are authorised to archive and republish.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const DEFAULT_MAX_MB = 250;

function usage(exitCode = 0) {
  console.log(`
Download recent public X/Twitter account video posts for Shorts (no API token).

Required:
  --handle <name>       X account name, with or without @

Optional:
  --out <directory>     Output directory (default: ../data/twitter-shorts/<handle>)
  --limit <count>       Stop after this many video files
  --max-mb <number>     Per-video maximum size (default: 250, max: 1024)
  --delay-ms <number>   Delay between media downloads (default: 900)
  --dry-run             List discovered video posts and captions; no files written
  --refresh             Re-download files already recorded in the manifest
  --include-retweets    Include reposted posts (excluded by default)
  --help                Show this help

Outputs:
  videos/               MP4 video files only (no image posts)
  shorts-manifest.json  Caption, source URL, duration and local file path

Important: the public X feed exposes a recent window only. It cannot reliably
enumerate an account's complete historic archive without authorised X access.
`);
  process.exit(exitCode);
}

function readArgs(argv) {
  const values = new Map();
  const flags = new Set(["dry-run", "refresh", "include-retweets", "help"]);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) usage(1);
    const key = raw.slice(2);
    if (flags.has(key)) { values.set(key, true); continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) usage(1);
    values.set(key, value);
    index += 1;
  }
  return values;
}

function positiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > max) throw new Error(`Expected a number from 1 to ${max}.`);
  return parsed;
}

function cleanHandle(value) {
  const handle = String(value || "").trim().replace(/^@/, "").replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, "").split(/[/?#]/)[0];
  if (!/^[A-Za-z0-9_]{1,30}$/.test(handle)) throw new Error("Enter a valid X account handle.");
  return handle;
}

function compactCaption(value) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, 2000); }

function variantDetails(variant) {
  const match = variant.url.match(/\/(\d+)x(\d+)\//);
  const width = Number(match?.[1] || 0);
  const height = Number(match?.[2] || 0);
  return { url: variant.url, width, height, bitrate: Number(variant.bitrate || 0) };
}

function bestMp4Variant(media) {
  return [...(media.video_info?.variants || [])]
    .filter((variant) => variant.content_type === "video/mp4" && typeof variant.url === "string")
    .map(variantDetails)
    // Prefer the highest resolution first; bitrate breaks ties. X commonly
    // provides 360p/480p/720p MP4 variants for the same source.
    .sort((left, right) => (right.width * right.height) - (left.width * left.height) || right.bitrate - left.bitrate)[0] || null;
}

function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}

function extractPublicTimeline(html, handle) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("X public timeline format changed or is unavailable.");
  let payload;
  try { payload = JSON.parse(match[1]); }
  catch { throw new Error("X public timeline could not be read."); }

  const tweets = new Map();
  walk(payload, (candidate) => {
    if (typeof candidate.id_str !== "string" || typeof candidate.full_text !== "string") return;
    const media = candidate.extended_entities?.media || candidate.entities?.media;
    if (!Array.isArray(media) || !media.some((item) => ["video", "animated_gif"].includes(item.type))) return;
    tweets.set(candidate.id_str, candidate);
  });

  return [...tweets.values()].flatMap((tweet) => {
    const repost = /^RT\s+@/i.test(tweet.full_text);
    return (tweet.extended_entities?.media || tweet.entities?.media || []).flatMap((media) => {
      if (!["video", "animated_gif"].includes(media.type)) return [];
      const variant = bestMp4Variant(media);
      if (!variant) return [];
      return [{
        tweetId: tweet.id_str,
        mediaKey: String(media.media_key || media.id_str || videoUrl),
        sourceUrl: `https://x.com/${handle}/status/${tweet.id_str}`,
        caption: compactCaption(tweet.full_text),
        publishedAt: tweet.created_at ? new Date(tweet.created_at).toISOString() : null,
        durationSeconds: Number.isFinite(Number(media.video_info?.duration_millis)) ? Math.round(Number(media.video_info.duration_millis) / 1000) : null,
        videoUrl: variant.url,
        width: variant.width || null,
        height: variant.height || null,
        bitrate: variant.bitrate || null,
        repost,
      }];
    });
  }).sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")));
}

async function discoverVideos(handle, includeRetweets) {
  const url = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`;
  const response = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; ActrezzMediaImporter/1.0)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    throw new Error(`X temporarily rate-limited its public feed${retryAfter ? `; retry after ${retryAfter} seconds` : ". Wait a little and rerun"}.`);
  }
  if (!response.ok) throw new Error(`X public timeline returned ${response.status}.`);
  const videos = extractPublicTimeline(await response.text(), handle);
  return includeRetweets ? videos : videos.filter((video) => !video.repost);
}

async function readManifest(filePath) {
  try { const parsed = JSON.parse(await fsp.readFile(filePath, "utf8")); return Array.isArray(parsed.items) ? parsed.items : []; }
  catch { return []; }
}

async function writeManifest(filePath, handle, items) {
  const ordered = [...items].sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")) || left.sourceUrl.localeCompare(right.sourceUrl));
  await fsp.writeFile(filePath, `${JSON.stringify({ source: "x-public-syndication", handle, generatedAt: new Date().toISOString(), itemCount: ordered.length, items: ordered }, null, 2)}\n`);
}

async function downloadVideo(url, destination, maxBytes) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(300_000) });
  if (!response.ok || !response.body) throw new Error(`video download returned ${response.status}`);
  const advertisedSize = Number(response.headers.get("content-length") || 0);
  if (advertisedSize > maxBytes) throw new Error(`video is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
  const stream = fs.createWriteStream(destination, { flags: "w" });
  let written = 0;
  try {
    for await (const chunk of response.body) {
      written += chunk.length;
      if (written > maxBytes) throw new Error(`video is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
      if (!stream.write(chunk)) await new Promise((resolve) => stream.once("drain", resolve));
    }
    await new Promise((resolve, reject) => stream.end((error) => error ? reject(error) : resolve()));
  } catch (error) {
    stream.destroy();
    await fsp.rm(destination, { force: true }).catch(() => undefined);
    throw error;
  }
  if (!written) throw new Error("empty video response");
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.get("help")) usage();
  const handle = cleanHandle(args.get("handle"));
  const maxMb = positiveInteger(args.get("max-mb"), DEFAULT_MAX_MB, 1024);
  const limit = args.has("limit") ? positiveInteger(args.get("limit"), 1) : undefined;
  const delayMs = positiveInteger(args.get("delay-ms"), 900, 60_000);
  const outputDir = path.resolve(args.get("out") || path.join(root, "..", "data", "twitter-shorts", handle.toLowerCase()));
  const videosDir = path.join(outputDir, "videos");
  const manifestPath = path.join(outputDir, "shorts-manifest.json");

  console.log(`Reading the public recent X media window for @${handle}...`);
  const discovered = await discoverVideos(handle, Boolean(args.get("include-retweets")));
  const targets = limit ? discovered.slice(0, limit) : discovered;
  console.log(`Found ${discovered.length} recent video media item${discovered.length === 1 ? "" : "s"}; images were skipped.`);
  if (args.get("dry-run")) { console.log(JSON.stringify(targets.map(({ videoUrl, repost, ...item }) => item), null, 2)); return; }

  await fsp.mkdir(videosDir, { recursive: true });
  const existing = await readManifest(manifestPath);
  const items = new Map(existing.map((item) => [`${item.tweetId}:${item.mediaKey}`, item]));
  let downloaded = 0; let skipped = 0; let failed = 0;
  for (const [index, item] of targets.entries()) {
    const key = `${item.tweetId}:${item.mediaKey}`;
    const fileName = `${item.tweetId}-${item.mediaKey.replace(/[^A-Za-z0-9_-]/g, "_")}.mp4`;
    const filePath = path.join(videosDir, fileName);
    if (!args.get("refresh") && items.has(key) && fs.existsSync(filePath)) { skipped += 1; continue; }
    process.stdout.write(`[${index + 1}/${targets.length}] ${item.sourceUrl} `);
    try {
      await downloadVideo(item.videoUrl, filePath, maxMb * 1024 * 1024);
      const { videoUrl, repost, ...manifestItem } = item;
      items.set(key, { ...manifestItem, sourceProvider: "x-public-syndication", videoFile: path.relative(outputDir, filePath) });
      await writeManifest(manifestPath, handle, [...items.values()]);
      downloaded += 1;
      console.log("downloaded");
    } catch (error) {
      failed += 1;
      console.log(`failed: ${String(error instanceof Error ? error.message : error).slice(0, 220)}`);
    }
    if (index < targets.length - 1) await wait(delayMs);
  }
  console.log(`Done. Downloaded: ${downloaded}; existing skipped: ${skipped}; failed: ${failed}.`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((error) => { console.error(`Error: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
