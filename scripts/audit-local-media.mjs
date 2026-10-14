import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const downloadsRoot = path.join(workspaceRoot, "downloads");
const thumbnailsRoot = path.join(workspaceRoot, "media", "thumbnails");
const catalogPath = path.join(projectRoot, "src", "lib", "youtube", "local-catalog.generated.json");
const reportPath = path.join(projectRoot, "docs", "LOCAL-MEDIA-AUDIT.md");

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const missingVideos = [];
const missingThumbnails = [];
let totalBytes = 0;

for (const video of catalog.videos) {
  const videoPath = path.join(downloadsRoot, video.relativePath);
  const thumbnailPath = path.join(thumbnailsRoot, `${video.id}.webp`);
  try {
    const info = await stat(videoPath);
    if (!info.isFile()) missingVideos.push({ id: video.id, title: video.title, path: video.relativePath });
    else totalBytes += info.size;
  } catch {
    missingVideos.push({ id: video.id, title: video.title, path: video.relativePath });
  }
  try {
    await access(thumbnailPath);
  } catch {
    missingThumbnails.push({ id: video.id, title: video.title });
  }
}

const lines = [
  "# Local Media Audit",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Videos in catalogue: ${catalog.videos.length}`,
  `Playable files missing: ${missingVideos.length}`,
  `Thumbnails missing: ${missingThumbnails.length}`,
  `Video storage: ${(totalBytes / 1024 ** 3).toFixed(2)} GiB`,
  "",
  "## Missing Videos",
  "",
  ...(missingVideos.length ? missingVideos.map((item) => `- ${item.id} | ${item.path} | ${item.title}`) : ["None"]),
  "",
  "## Missing Thumbnails",
  "",
  ...(missingThumbnails.length ? missingThumbnails.map((item) => `- ${item.id} | ${item.title}`) : ["None"]),
  "",
];

await writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Local media audit: ${catalog.videos.length} videos, ${missingVideos.length} missing videos, ${missingThumbnails.length} missing thumbnails.`);
if (missingVideos.length > 0) process.exitCode = 1;
