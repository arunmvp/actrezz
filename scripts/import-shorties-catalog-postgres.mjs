import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDb } from "./lib/db.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(appRoot, "..");
const seedDirArgument = process.argv.find((argument) => argument.startsWith("--seed-dir="));
const seedDir = seedDirArgument ? path.resolve(seedDirArgument.slice("--seed-dir=".length)) : path.join(workspaceRoot, "data", "shorties-import");
const apply = process.argv.includes("--apply");
const seed = JSON.parse(await readFile(path.join(seedDir, "database-seed.json"), "utf8"));

if (seed.schemaVersion !== 1 || !Array.isArray(seed.videos) || !Array.isArray(seed.tags)) {
  throw new Error("Invalid Shorties database seed.");
}

const chunks = (items, size = 300) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
const prisma = createDb();

async function existingSources(sourceUrls) {
  const rows = [];
  for (const batch of chunks(sourceUrls.filter(Boolean))) {
    rows.push(...await prisma.videoSource.findMany({
      where: { provider: "usersporn-shorties", sourcePageUrl: { in: batch } },
      select: { videoId: true, sourcePageUrl: true },
    }));
  }
  return new Map(rows.map((row) => [row.sourcePageUrl, row.videoId]));
}

try {
  const [existingById, existingBySlug, existingBySource, productionTags] = await Promise.all([
    prisma.video.findMany({ where: { id: { in: seed.videos.map((video) => video.id) } }, select: { id: true } }),
    prisma.video.findMany({ where: { slug: { in: seed.videos.map((video) => video.slug) } }, select: { id: true, slug: true } }),
    existingSources(seed.videos.map((video) => video.sourcePageUrl)),
    prisma.tag.findMany({ where: { slug: { in: seed.tags.map((tag) => tag.slug) } }, select: { id: true, slug: true } }),
  ]);
  const byId = new Set(existingById.map((row) => row.id));
  const bySlug = new Set(existingBySlug.map((row) => row.slug));
  const creates = seed.videos.filter((video) => !byId.has(video.id) && !bySlug.has(video.slug) && !existingBySource.has(video.sourcePageUrl));
  const duplicateCount = seed.videos.length - creates.length;
  const existingTags = new Map(productionTags.map((tag) => [tag.slug, tag.id]));
  const newTags = seed.tags.filter((tag) => !existingTags.has(tag.slug));

  const audit = {
    seedVideos: seed.videos.length,
    validSourceTags: seed.tags.length,
    videosToStage: creates.length,
    productionDuplicatesProtected: duplicateCount,
    tagsToCreate: newTags.length,
    tagsReused: seed.tags.length - newTags.length,
    mutation: apply,
  };
  if (!apply) {
    console.log(JSON.stringify({ mode: "shorties-stage-dry-run", ...audit }, null, 2));
    process.exit(0);
  }

  // Tags are shared catalogue entities. Reuse an existing slug whenever it is
  // already present; otherwise create the shorties tag with a neutral draft
  // description. No public tag count is changed until the tag-page rollout.
  for (const batch of chunks(newTags)) {
    await prisma.tag.createMany({
      data: batch.map((tag) => ({ id: tag.id, name: tag.name, slug: tag.slug, videoCount: 0 })),
      skipDuplicates: true,
    });
  }
  const resolvedTags = await prisma.tag.findMany({ where: { slug: { in: seed.tags.map((tag) => tag.slug) } }, select: { id: true, slug: true } });
  const tagIdBySlug = new Map(resolvedTags.map((tag) => [tag.slug, tag.id]));

  let stagedVideos = 0;
  for (const batch of chunks(creates, 200)) {
    const result = await prisma.video.createMany({
      data: batch.map((video) => ({
        id: video.id,
        title: video.title,
        slug: video.slug,
        description: video.description,
        durationSeconds: video.durationSeconds || null,
        seoTitle: `${video.title} | Shorties`,
        seoDescription: video.description.slice(0, 300),
        seoKeywords: video.tags,
        status: "PROCESSING",
        mediaReady: false,
        isShort: true,
        viewCount: BigInt(video.viewCount),
        publishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
        r2VideoKey: video.r2VideoKey,
        r2ThumbnailKey: video.r2ThumbnailKey,
      })),
      skipDuplicates: true,
    });
    stagedVideos += result.count;
  }

  const stagedIds = new Set(creates.map((video) => video.id));
  const videoTags = creates.flatMap((video) => video.tags.map((name) => ({ videoId: video.id, tagId: tagIdBySlug.get(name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tag") })))
    .filter((row) => stagedIds.has(row.videoId) && row.tagId);
  const videoSources = creates.filter((video) => video.sourcePageUrl || video.sourceMediaUrl).map((video) => ({
    videoId: video.id,
    provider: "usersporn-shorties",
    sourcePageUrl: video.sourcePageUrl,
    sourceMediaUrl: video.sourceMediaUrl,
  }));
  let linkedTags = 0;
  for (const batch of chunks(videoTags, 500)) {
    const result = await prisma.videoTag.createMany({ data: batch, skipDuplicates: true });
    linkedTags += result.count;
  }
  let linkedSources = 0;
  for (const batch of chunks(videoSources, 500)) {
    const result = await prisma.videoSource.createMany({ data: batch, skipDuplicates: true });
    linkedSources += result.count;
  }

  console.log(JSON.stringify({
    mode: "shorties-staged",
    ...audit,
    created: { videos: stagedVideos, tags: newTags.length, videoTags: linkedTags, sources: linkedSources },
    next: "Run R2 audit after the MP4 and thumbnail uploads. Only verified rows can be published.",
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
