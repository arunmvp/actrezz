import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const downloadsRoot = process.env.ACTREZZ_IMPORT_DOWNLOADS_DIR
  ? path.resolve(process.env.ACTREZZ_IMPORT_DOWNLOADS_DIR)
  : path.join(workspaceRoot, "downloads");
const option = (name, fallback) => {
  const argument = process.argv.find((item) => item.startsWith(`${name}=`));
  return argument ? path.resolve(argument.slice(name.length + 1)) : fallback;
};
const metadataPath = option("--metadata", path.join(workspaceRoot, "data", "videos.ui.json"));
const databaseSeedPath = option("--seed", path.join(workspaceRoot, "data", "database-seed.json"));
const outputPath = option("--output", path.join(projectRoot, "src", "lib", "youtube", "local-catalog.generated.json"));
const playableExtensions = new Set([".mp4", ".webm", ".m4v", ".mov"]);

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isAznudeUrl(value) {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase();
    return host === "aznude.com" || host === "www.aznude.com" || /^cdn\d*\.aznude\.com$/i.test(host);
  } catch { return false; }
}

async function findVideos(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findVideos(absolutePath)));
      continue;
    }
    if (playableExtensions.has(path.extname(entry.name).toLowerCase())) found.push(absolutePath);
  }
  return found;
}

const [metadata, databaseSeed, localFiles] = await Promise.all([
  readFile(metadataPath, "utf8").then(JSON.parse),
  readFile(databaseSeedPath, "utf8").then(JSON.parse),
  findVideos(downloadsRoot),
]);

const metadataBySlug = new Map(metadata.map((video) => [video.slug, video]));
const workById = new Map(databaseSeed.works.map((work) => [work.id, work]));
const videos = [];

for (const absolutePath of localFiles) {
  const slug = path.basename(absolutePath, path.extname(absolutePath));
  const source = metadataBySlug.get(slug);
  if (!source) continue;
  const fileStat = await stat(absolutePath);
  const seededWork = source.workId ? workById.get(source.workId) : null;
  videos.push({
    id: source.id,
    slug: source.slug,
    title: source.title,
    description: source.description || source.seoDescription || "",
    durationSeconds: Number(source.durationSeconds) || 0,
    year: Number(source.year) || source.work?.releaseYear || null,
    seasonNumber: source.seasonNumber ?? null,
    episodeNumber: source.episodeNumber ?? null,
    work: source.work
      ? {
          id: source.work.id,
          title: source.work.title,
          slug: source.work.slug,
          type: source.work.type,
          description: seededWork?.description || null,
        }
      : null,
    actresses: (source.actresses || []).map((person) => ({
      id: person.id || `act_${person.slug}`,
      name: person.name,
      slug: person.slug,
    })),
    tags: (source.tags || []).map((tag) => ({ name: tag.name, slug: tag.slug || slugify(tag.name) })),
    thumbnailSourceUrl: source.thumbnailUrl || null,
    seoTitle: source.seoTitle || null,
    seoDescription: source.seoDescription || null,
    seoKeywords: source.seoKeywords || [],
    isShort: Boolean(source.isShort),
    relativePath: path.relative(downloadsRoot, absolutePath).split(path.sep).join("/"),
    downloadedAt: Math.round(fileStat.mtimeMs),
    sizeBytes: fileStat.size,
  });
}

videos.sort((a, b) => b.downloadedAt - a.downloadedAt || a.title.localeCompare(b.title));

const actresses = databaseSeed.actresses.map((actress) => {
  const imageKey = String(actress.profileImageKey || "").replace(/^\/+/, "");
  const profileFile = imageKey ? path.join(workspaceRoot, imageKey) : "";
  const profileImageSlug = actress.profileImageKey && isAznudeUrl(actress.profileSourceUrl || actress.profileUrl) && existsSync(profileFile)
    ? path.basename(path.dirname(profileFile))
    : null;
  return {
    id: actress.id,
    name: actress.name,
    slug: actress.slug || slugify(actress.name),
    // Only a locally present portrait whose provenance is explicitly AZNude is
    // eligible. Video thumbnails and unverified provider images never qualify.
    profileImageSlug,
  };
});

await writeFile(
  outputPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), actresses, videos }, null, 2)}\n`,
  "utf8",
);

console.log(`Generated ${videos.length} local videos and ${actresses.length} actress entries. Portraits were not changed.`);
