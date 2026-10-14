import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

const sourceRoot = path.resolve(process.cwd(), "..", "shorties", "downloads");
const outputRoot = path.resolve(process.cwd(), "..", "shorties", "thumbnails");
const workerArgument = process.argv.find((argument) => argument.startsWith("--workers="));
const workers = Math.max(1, Math.min(12, Number.parseInt(workerArgument?.split("=")[1] || "6", 10) || 6));
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const auditOnly = process.argv.includes("--audit");
const repairExisting = process.argv.includes("--repair");

async function mediaFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) return mediaFiles(candidate);
    const match = entry.isFile() && /^usersporn-(\d+)-720p\.mp4$/i.exec(entry.name);
    return match ? [{ sourceId: match[1], input: candidate }] : [];
  }));
  return nested.flat();
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${binary} exited ${code}`)));
  });
}

async function thumbnailQuality(file) {
  try {
    const { channels } = await sharp(file).stats();
    const visible = channels.slice(0, 3);
    const mean = visible.reduce((total, channel) => total + channel.mean, 0) / visible.length;
    const deviation = visible.reduce((total, channel) => total + channel.stdev, 0) / visible.length;
    // Uniform black/white frames are usually opening fades, blank slates or
    // end cards. Do not reject normal dark scenes: they retain texture.
    return { bad: deviation < 10 && (mean < 28 || mean > 227), mean, deviation };
  } catch {
    return { bad: true, mean: 0, deviation: 0 };
  }
}

async function durationFor(input) {
  const output = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", input]);
  const duration = Number.parseFloat(output.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function seekTime(duration) {
  // Skip intros/fades without jumping too far into very short clips. A point
  // around one third is generally representative for a vertical short.
  if (!duration) return 2;
  return Math.max(0.8, Math.min(duration - 0.25, Math.max(1.5, duration * 0.35)));
}

async function makeThumbnail(input, output) {
  const seek = seekTime(await durationFor(input)).toFixed(3);
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-ss", seek, "-i", input,
    "-frames:v", "1", "-vf", "scale=480:-2:force_original_aspect_ratio=decrease",
    "-c:v", "libwebp", "-q:v", "76", "-y", output,
  ]);
}

await mkdir(outputRoot, { recursive: true });
const allFiles = await mediaFiles(sourceRoot);
const pending = [];
const bad = [];

for (const file of allFiles) {
  const output = path.join(outputRoot, `${file.sourceId}.webp`);
  const present = await exists(output);
  if (!present) {
    pending.push({ ...file, output, reason: "missing" });
    continue;
  }
  if (auditOnly || repairExisting) {
    const quality = await thumbnailQuality(output);
    if (quality.bad) bad.push({ ...file, output, quality, reason: "flat-frame" });
  }
}

if (auditOnly) {
  console.log(JSON.stringify({ discovered: allFiles.length, lowQuality: bad.length, samples: bad.slice(0, 20).map(({ sourceId, quality }) => ({ sourceId, ...quality })) }, null, 2));
  process.exit(0);
}

if (repairExisting) pending.push(...bad);
console.log(JSON.stringify({ sourceRoot, outputRoot, discovered: allFiles.length, pending: pending.length, missing: pending.filter((item) => item.reason === "missing").length, repairing: bad.length, workers }));
let cursor = 0;
let completed = 0;
let failed = 0;
async function worker() {
  while (true) {
    const current = pending[cursor++];
    if (!current) return;
    try { await makeThumbnail(current.input, current.output); }
    catch (error) { failed += 1; console.error(`[failed] ${current.sourceId}: ${error instanceof Error ? error.message : String(error)}`); }
    completed += 1;
    if (completed % 25 === 0 || completed === pending.length) console.log(`[${completed}/${pending.length}] generated=${completed - failed} failed=${failed}`);
  }
}
await Promise.all(Array.from({ length: workers }, worker));
console.log(JSON.stringify({ complete: true, discovered: allFiles.length, generated: completed - failed, skipped: allFiles.length - pending.length, failed }));
