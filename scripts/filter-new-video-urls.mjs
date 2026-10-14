import { readFile, writeFile } from "node:fs/promises";
import { createDb } from "./lib/db.mjs";

// Compare a list of source-site video URLs against what is already in the
// production DB (VideoSource.sourcePageUrl) and write out only the URLs that
// are NOT yet imported, so they can be downloaded next.
//
// Usage:
//   node scripts/filter-new-video-urls.mjs [inputPath] [outputPath]
// Defaults:
//   input : C:\projects\celeb\movie_tv_urls.txt
//   output: C:\projects\celeb\new_video_urls.txt

const inputPath = process.argv[2] || "C:\\projects\\celeb\\movie_tv_urls.txt";
const outputPath = process.argv[3] || "C:\\projects\\celeb\\new_video_urls.txt";

// Normalise a URL for comparison: lowercase host+path, strip query/hash,
// strip a trailing slash, drop the protocol so http/https differences do not
// cause false mismatches.
function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const u = new URL(value);
    const host = u.host.toLowerCase().replace(/^www\./, "");
    let path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    // Not a valid absolute URL; fall back to a loose normalisation.
    return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
  }
}

const prisma = createDb();
try {
  const raw = await readFile(inputPath, "utf8");
  const inputLines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  // De-duplicate the input itself (keep first occurrence, preserve order).
  const seen = new Set();
  const uniqueInput = [];
  let inputDupes = 0;
  for (const line of inputLines) {
    const key = normalizeUrl(line);
    if (!key) continue;
    if (seen.has(key)) { inputDupes += 1; continue; }
    seen.add(key);
    uniqueInput.push({ original: line, key });
  }

  // Build the set of URLs already present in production.
  const sources = await prisma.videoSource.findMany({ select: { sourcePageUrl: true }, where: { sourcePageUrl: { not: null } } });
  const existing = new Set(sources.map((s) => normalizeUrl(s.sourcePageUrl)).filter(Boolean));

  const newUrls = [];
  let alreadyImported = 0;
  for (const item of uniqueInput) {
    if (existing.has(item.key)) alreadyImported += 1;
    else newUrls.push(item.original);
  }

  console.log("Input file:", inputPath);
  console.log("  total lines:", inputLines.length);
  console.log("  duplicate lines in input (skipped):", inputDupes);
  console.log("  unique input URLs:", uniqueInput.length);
  console.log("Production VideoSource URLs:", existing.size);
  console.log("Already imported (removed):", alreadyImported);
  console.log("NEW URLs to download:", newUrls.length);

  await writeFile(outputPath, newUrls.join("\n") + (newUrls.length ? "\n" : ""), "utf8");
  console.log("\nWrote new URL list ->", outputPath);
} finally {
  await prisma.$disconnect();
}
