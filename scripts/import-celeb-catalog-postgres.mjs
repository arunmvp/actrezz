import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDb } from "./lib/db.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const seedDirOption = process.argv.find((arg) => arg.startsWith("--seed-dir="));
const seedDir = seedDirOption
  ? path.resolve(seedDirOption.slice("--seed-dir=".length))
  : path.join(workspaceRoot, "data", "celeb-import");
const delta = JSON.parse(await readFile(path.join(seedDir, "database-seed.delta.json"), "utf8"));
const combined = JSON.parse(await readFile(path.join(seedDir, "database-seed.json"), "utf8"));
const apply = process.argv.includes("--apply");
const auditProduction = process.argv.includes("--audit-production");
// A profile image must be an independently verified portrait.  Importing a
// catalogue seed must never turn a video screenshot into an actress profile.
// Local Import Studio therefore leaves new profiles empty unless this explicit
// opt-in is passed by a portrait-verification workflow.
const includeVerifiedProfiles = process.argv.includes("--with-verified-profiles");

function isAznudeUrl(value) {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase();
    return host === "aznude.com" || host === "www.aznude.com" || /^cdn\d*\.aznude\.com$/i.test(host);
  } catch { return false; }
}

function verifiedProfile(item) {
  return Boolean(item.profileImageKey && isAznudeUrl(item.profileSourceUrl || item.profileUrl));
}

if (delta.mode !== "production-safe-delta") throw new Error("Refusing import: expected a production-safe delta seed.");

if (!apply && !auditProduction) {
  console.log(JSON.stringify({
    mode: delta.mode,
    dryRun: true,
    baselineVideosProtected: delta.baselineVideoCount,
    ...delta.counts,
    message: "Static validation only. Use --audit-production to compare with Supabase or --apply to stage the new-video delta.",
  }, null, 2));
  process.exit(0);
}

const chunks = (items, size = 500) => Array.from(
  { length: Math.ceil(items.length / size) },
  (_, index) => items.slice(index * size, (index + 1) * size),
);
const sortValue = (value) => value.toLowerCase().replace(/^(the|a|an)\s+/i, "");
const initial = (value) => (sortValue(value).match(/[a-z0-9]/i)?.[0] || "#").toUpperCase();
const byId = (items) => new Map(items.map((item) => [item.id, item]));
const combinedActressById = byId(combined.actresses);
const combinedWorkById = byId(combined.works);
const combinedTagById = byId(combined.tags);
const sourceByVideoId = new Map(delta.videoSources.map((item) => [item.videoId, item]));

const referencedActressIds = [...new Set(delta.videoActresses.map((item) => item.actressId))];
const referencedWorkIds = [...new Set(delta.videos.map((item) => item.workId).filter(Boolean))];
const referencedTagIds = [...new Set(delta.videoTags.map((item) => item.tagId))];
const relevantActresses = referencedActressIds.map((id) => combinedActressById.get(id));
const relevantWorks = referencedWorkIds.map((id) => combinedWorkById.get(id));
const relevantTags = referencedTagIds.map((id) => combinedTagById.get(id));

for (const [label, values] of [["actress", relevantActresses], ["work", relevantWorks], ["tag", relevantTags]]) {
  if (values.some((item) => !item)) throw new Error(`Delta references an unknown ${label} ID.`);
}

async function createManyBatched(model, rows) {
  let count = 0;
  for (const batch of chunks(rows)) {
    const result = await model.createMany({ data: batch, skipDuplicates: true });
    count += result.count;
  }
  return count;
}

async function readProduction(prisma) {
  const [actresses, works, tags, videos, sources, stats, searchTrigger] = await Promise.all([
    prisma.actress.findMany({ select: { id: true, slug: true, profileImage: true } }),
    prisma.work.findMany({ select: { id: true, slug: true, type: true } }),
    prisma.tag.findMany({ select: { id: true, slug: true } }),
    prisma.video.findMany({ select: { id: true, slug: true, status: true, mediaReady: true } }),
    prisma.videoSource.findMany({ select: { videoId: true, sourcePageUrl: true } }),
    prisma.catalogStats.findUnique({ where: { id: "primary" } }),
    prisma.$queryRawUnsafe(`SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_video_search_vector' AND NOT tgisinternal) AS present`),
  ]);
  return { actresses, works, tags, videos, sources, stats, searchTrigger: Boolean(searchTrigger[0]?.present) };
}

function productionMaps(production) {
  return {
    actressBySlug: new Map(production.actresses.map((item) => [item.slug, item])),
    workByKey: new Map(production.works.map((item) => [`${item.type}:${item.slug}`, item])),
    tagBySlug: new Map(production.tags.map((item) => [item.slug, item])),
    videoById: new Map(production.videos.map((item) => [item.id, item])),
    videoBySlug: new Map(production.videos.map((item) => [item.slug, item])),
    videoBySource: new Map(production.sources.filter((item) => item.sourcePageUrl).map((item) => [item.sourcePageUrl, item])),
  };
}

function classifyVideos(maps) {
  const matches = [];
  const create = [];
  for (const item of delta.videos) {
    const source = sourceByVideoId.get(item.id);
    const exactId = maps.videoById.get(item.id);
    const slug = maps.videoBySlug.get(item.slug);
    const sourceMatch = source?.watchUrl ? maps.videoBySource.get(source.watchUrl) : null;
    const match = exactId || slug || sourceMatch;
    if (match) {
      matches.push({ seedId: item.id, productionId: match.id || match.videoId, reason: exactId ? "id" : slug ? "slug" : "source" });
    } else {
      create.push(item);
    }
  }
  return { matches, create };
}

async function refreshPublicStats(prisma) {
  const publicFilter = `v.status = 'READY' AND v."mediaReady" = TRUE`;
  await prisma.$executeRawUnsafe(`UPDATE "Actress" a SET "videoCount" = (SELECT count(*)::int FROM "VideoActress" va JOIN "Video" v ON v.id = va."videoId" WHERE va."actressId" = a.id AND ${publicFilter})`);
  await prisma.$executeRawUnsafe(`UPDATE "Work" w SET "videoCount" = (SELECT count(*)::int FROM "Video" v WHERE v."workId" = w.id AND ${publicFilter})`);
  await prisma.$executeRawUnsafe(`UPDATE "Tag" t SET "videoCount" = (SELECT count(*)::int FROM "VideoTag" vt JOIN "Video" v ON v.id = vt."videoId" WHERE vt."tagId" = t.id AND ${publicFilter})`);
  await prisma.$executeRawUnsafe(`INSERT INTO "YearStat" (year, "videoCount", "updatedAt") SELECT year, count(*)::int, now() FROM "Video" v WHERE ${publicFilter} AND year IS NOT NULL GROUP BY year ON CONFLICT (year) DO UPDATE SET "videoCount" = EXCLUDED."videoCount", "updatedAt" = now()`);
  const [videoCount, actressCount, movieCount, tvSeriesCount, tagCount] = await Promise.all([
    prisma.video.count({ where: { status: "READY", mediaReady: true, isShort: false } }),
    prisma.actress.count({ where: { isPublished: true, videoCount: { gt: 0 } } }),
    prisma.work.count({ where: { isPublished: true, type: "MOVIE", videoCount: { gt: 0 } } }),
    prisma.work.count({ where: { isPublished: true, type: "TV_SHOW", videoCount: { gt: 0 } } }),
    prisma.tag.count({ where: { videoCount: { gt: 0 } } }),
  ]);
  await prisma.catalogStats.upsert({
    where: { id: "primary" },
    create: { id: "primary", videoCount, actressCount, movieCount, tvSeriesCount, tagCount },
    update: { videoCount, actressCount, movieCount, tvSeriesCount, tagCount },
  });
  return { videoCount, actressCount, movieCount, tvSeriesCount, tagCount };
}

const prisma = createDb();
try {
  const before = await readProduction(prisma);
  const beforeMaps = productionMaps(before);
  const classified = classifyVideos(beforeMaps);
  const duplicateReasons = Object.fromEntries(["id", "slug", "source"].map((reason) => [reason, classified.matches.filter((item) => item.reason === reason).length]));
  const missingActresses = relevantActresses.filter((item) => !beforeMaps.actressBySlug.has(item.slug));
  const existingActressProfileUpdates = includeVerifiedProfiles ? relevantActresses.filter((item) => {
    const production = beforeMaps.actressBySlug.get(item.slug);
    return production && !production.profileImage && verifiedProfile(item);
  }) : [];
  const missingWorks = relevantWorks.filter((item) => !beforeMaps.workByKey.has(`${item.type}:${item.slug}`));
  const missingTags = relevantTags.filter((item) => !beforeMaps.tagBySlug.has(item.slug));

  const audit = {
    productionBefore: {
      videos: before.videos.length,
      readyMediaVideos: before.videos.filter((item) => item.status === "READY" && item.mediaReady).length,
      actresses: before.actresses.length,
      works: before.works.length,
      tags: before.tags.length,
    },
    deltaVideos: delta.videos.length,
    productionDuplicates: classified.matches.length,
    duplicateReasons,
    videosToStage: classified.create.length,
    existingActressesReused: relevantActresses.length - missingActresses.length,
    newActresses: missingActresses.length,
    existingActressProfilesToHydrate: existingActressProfileUpdates.length,
    existingWorksReused: relevantWorks.length - missingWorks.length,
    newWorks: missingWorks.length,
    existingTagsReused: relevantTags.length - missingTags.length,
    newTags: missingTags.length,
    searchVectorTriggerPresent: before.searchTrigger,
  };

  if (!apply) {
    console.log(JSON.stringify({ mode: "production-audit", mutatesDatabase: false, ...audit }, null, 2));
    process.exitCode = before.searchTrigger ? 0 : 2;
  } else {
    if (!before.searchTrigger) throw new Error("Search-vector trigger is missing in production; refusing import until search indexing is fixed.");

    const createdActresses = await createManyBatched(prisma.actress, missingActresses.map((item) => ({
      id: item.id, name: item.name, slug: item.slug, sortName: sortValue(item.name), initial: initial(item.name),
      profileImage: includeVerifiedProfiles && verifiedProfile(item) ? item.profileImageKey : null, seoTitle: item.seoTitle, seoDescription: item.seoDescription,
      videoCount: 0, isPublished: false,
    })));
    let hydratedExistingActressProfiles = 0;
    for (const item of existingActressProfileUpdates) {
      const production = beforeMaps.actressBySlug.get(item.slug);
      const result = await prisma.actress.updateMany({
        where: { id: production.id, profileImage: null },
        data: { profileImage: item.profileImageKey },
      });
      hydratedExistingActressProfiles += result.count;
    }
    const createdWorks = await createManyBatched(prisma.work, missingWorks.map((item) => ({
      id: item.id, title: item.title, slug: item.slug, sortTitle: sortValue(item.title), initial: initial(item.title),
      type: item.type, releaseYear: item.releaseYear, description: item.description,
      seoTitle: item.seoTitle, seoDescription: item.seoDescription, videoCount: 0, isPublished: false,
    })));
    const createdTags = await createManyBatched(prisma.tag, missingTags.map((item) => ({
      id: item.id, name: item.name, slug: item.slug, seoTitle: item.seoTitle,
      seoDescription: item.seoDescription, videoCount: 0,
    })));

    const entityState = await readProduction(prisma);
    const entityMaps = productionMaps(entityState);
    const actressIdMap = new Map(relevantActresses.map((item) => [item.id, entityMaps.actressBySlug.get(item.slug)?.id]));
    const workIdMap = new Map(relevantWorks.map((item) => [item.id, entityMaps.workByKey.get(`${item.type}:${item.slug}`)?.id]));
    const tagIdMap = new Map(relevantTags.map((item) => [item.id, entityMaps.tagBySlug.get(item.slug)?.id]));
    if ([...actressIdMap.values(), ...workIdMap.values(), ...tagIdMap.values()].some((id) => !id)) {
      throw new Error("Could not resolve every production entity ID after bulk insert.");
    }

    const createdVideos = await createManyBatched(prisma.video, classified.create.map((item) => ({
      id: item.id, title: item.title, slug: item.slug, description: item.description,
      durationSeconds: item.durationSeconds, year: item.year, seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber, workId: item.workId ? workIdMap.get(item.workId) : null,
      seoTitle: item.seoTitle, seoDescription: item.seoDescription, seoKeywords: item.seoKeywords,
      status: "PROCESSING", mediaReady: false, isShort: false,
      r2VideoKey: `videos/${item.id}.mp4`, r2ThumbnailKey: `thumbnails/${item.id}.webp`,
      videoUrl: null, thumbnailUrl: null, publishedAt: null,
    })));

    const eligibleVideoIds = new Set([
      ...classified.create.map((item) => item.id),
      ...classified.matches.filter((item) => item.reason === "id").map((item) => item.seedId),
    ]);
    const videoActresses = delta.videoActresses.filter((item) => eligibleVideoIds.has(item.videoId)).map((item) => ({
      videoId: item.videoId, actressId: actressIdMap.get(item.actressId), sortOrder: item.sortOrder,
    }));
    const videoTags = delta.videoTags.filter((item) => eligibleVideoIds.has(item.videoId)).map((item) => ({
      videoId: item.videoId, tagId: tagIdMap.get(item.tagId),
    }));
    const videoSources = delta.videoSources.filter((item) => eligibleVideoIds.has(item.videoId)).map((item) => ({
      id: item.id, videoId: item.videoId, provider: item.provider,
      sourcePageUrl: item.watchUrl, sourceMediaUrl: item.directFileUrl,
    }));
    const createdVideoActresses = await createManyBatched(prisma.videoActress, videoActresses);
    const createdVideoTags = await createManyBatched(prisma.videoTag, videoTags);
    const createdVideoSources = await createManyBatched(prisma.videoSource, videoSources);
    const publicStats = await refreshPublicStats(prisma);

    console.log(JSON.stringify({
      mode: "production-stage-complete",
      oldVideoRowsUpdated: 0,
      ...audit,
      created: {
        actresses: createdActresses, works: createdWorks, tags: createdTags, videos: createdVideos,
        videoActresses: createdVideoActresses, videoTags: createdVideoTags, videoSources: createdVideoSources,
        existingActressProfilesHydrated: hydratedExistingActressProfiles,
      },
      publicStats,
      next: "Upload delta media to R2, then run the publish audit/finalizer.",
    }, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
