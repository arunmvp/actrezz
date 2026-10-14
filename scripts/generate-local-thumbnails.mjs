import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import catalog from "../src/lib/youtube/local-catalog.generated.json" with { type: "json" };

const projectRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const downloadsRoot = process.env.ACTREZZ_IMPORT_DOWNLOADS_DIR
  ? path.resolve(process.env.ACTREZZ_IMPORT_DOWNLOADS_DIR)
  : path.join(workspaceRoot, "downloads");
const outputRoot = path.join(workspaceRoot, "media", "thumbnails");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 36) : catalog.videos.length;
const force = process.argv.includes("--force");
const workersArg = process.argv.find((arg) => arg.startsWith("--workers="));
const workerCount = workersArg ? Math.max(1, Math.min(12, Number(workersArg.split("=")[1]) || 4)) : 4;

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

function runFfmpeg(video, destination) {
  const input = path.join(downloadsRoot, ...video.relativePath.split("/"));
  const seek = Math.max(1, Math.min(12, Math.round((video.durationSeconds || 8) * 0.2)));
  const args = [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", String(seek), "-i", input,
    "-frames:v", "1",
    "-vf", "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:black",
    "-c:v", "libwebp", "-quality", "78", destination,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(error.trim() || `ffmpeg exited ${code}`)));
  });
}

await mkdir(outputRoot, { recursive: true });
const queue = catalog.videos.slice(0, limit);
let cursor = 0;
let created = 0;
let skipped = 0;
let failed = 0;

async function worker() {
  while (cursor < queue.length) {
    const video = queue[cursor++];
    const destination = path.join(outputRoot, `${video.id}.webp`);
    if (!force && await exists(destination)) { skipped += 1; continue; }
    try {
      await runFfmpeg(video, destination);
      created += 1;
    } catch (error) {
      failed += 1;
      console.error(`[thumbnail] ${video.id}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

await Promise.all(Array.from({ length: workerCount }, () => worker()));
console.log(`Thumbnails ready: created=${created}, existing=${skipped}, failed=${failed}, checked=${queue.length}`);
if (failed > 0) process.exitCode = 1;
