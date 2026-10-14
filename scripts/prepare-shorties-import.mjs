import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(appRoot, "..");
const shortiesRoot = path.join(workspaceRoot, "shorties");
const metadataPath = path.join(shortiesRoot, "usersporn_metadata_output", "2min-meta.jsonl");
const downloadsRoot = path.join(shortiesRoot, "downloads");
const thumbnailsRoot = path.join(shortiesRoot, "thumbnails");
const outputRoot = path.join(workspaceRoot, "data", "shorties-import");

function slugify(value) {
  return String(value || "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "short";
}

function text(value) {
  return String(value || "").replace(/&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function durationSeconds(value) {
  const match = String(value || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function downloadedIds(directory) {
  const ids = new Set();
  const walk = async (current) => {
    const entries = await readdir(current, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) return walk(candidate);
      const match = entry.isFile() && /^usersporn-(\d+)-720p\.mp4$/i.exec(entry.name);
      if (match) ids.add(match[1]);
    }));
  };
  await walk(directory);
  return ids;
}

const [raw, localIds] = await Promise.all([readFile(metadataPath, "utf8"), downloadedIds(downloadsRoot)]);
const skipped = { invalidJson: 0, missingLocalVideo: 0, missingThumbnail: 0, invalidRecord: 0, duplicateSource: 0 };
const sourceIds = new Set();
const videos = [];

for (const line of raw.split(/\r?\n/)) {
  if (!line.trim()) continue;
  let record;
  try { record = JSON.parse(line); } catch { skipped.invalidJson += 1; continue; }
  const sourceId = String(record.sourceId || "").trim();
  const title = text(record.title);
  if (!sourceId || !title) { skipped.invalidRecord += 1; continue; }
  if (sourceIds.has(sourceId)) { skipped.duplicateSource += 1; continue; }
  sourceIds.add(sourceId);
  if (!localIds.has(sourceId)) { skipped.missingLocalVideo += 1; continue; }
  if (!await exists(path.join(thumbnailsRoot, `${sourceId}.webp`))) { skipped.missingThumbnail += 1; continue; }
  const tags = [...new Set((record.tags || []).map(text).filter(Boolean))];
  const seconds = durationSeconds(record.duration);
  const published = new Date(record.publishedAt || record.collectedAt || "");
  videos.push({
    id: `shorties_usersporn_${sourceId}`,
    sourceId,
    title,
    slug: `short-${sourceId}-${slugify(title)}`,
    description: text(record.description) || `${title}.`,
    durationSeconds: seconds,
    publishedAt: Number.isNaN(published.valueOf()) ? null : published.toISOString(),
    viewCount: Math.max(0, Number(record.views || 0) || 0),
    tags,
    r2VideoKey: `shorties/videos/${sourceId}.mp4`,
    r2ThumbnailKey: `shorties/thumbnails/${sourceId}.webp`,
    sourcePageUrl: String(record.sourcePageUrl || "").trim() || null,
    sourceMediaUrl: String(record.videoUrl720p || "").trim() || null,
  });
}

const tagsBySlug = new Map();
for (const video of videos) {
  for (const name of video.tags) {
    const slug = slugify(name);
    if (!tagsBySlug.has(slug)) tagsBySlug.set(slug, { id: `shorties_tag_${slug}`, name, slug });
  }
}

const seed = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: path.relative(workspaceRoot, metadataPath).replace(/\\/g, "/"),
  videos,
  tags: [...tagsBySlug.values()].sort((left, right) => left.name.localeCompare(right.name)),
  counts: { videos: videos.length, tags: tagsBySlug.size, skipped },
};

await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, "database-seed.json"), `${JSON.stringify(seed, null, 2)}\n`);
console.log(JSON.stringify({ output: path.join(outputRoot, "database-seed.json"), ...seed.counts }, null, 2));
