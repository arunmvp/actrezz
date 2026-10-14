import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDb } from "./lib/db.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const seed = JSON.parse(await readFile(path.join(workspaceRoot, "data", "database-seed.json"), "utf8"));
const local = JSON.parse(await readFile(path.join(projectRoot, "src", "lib", "youtube", "local-catalog.generated.json"), "utf8"));
const allActressNames = JSON.parse(await readFile(path.join(workspaceRoot, "data", "actresses.json"), "utf8"));
const localById = new Map(local.videos.map((video) => [video.id, video]));
const actressRankById = new Map(seed.actresses.map((item, index) => [item.id, index + 1]));
const prisma = createDb();

const chunks = (items, size = 50) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
const sortValue = (value) => value.toLowerCase().replace(/^(the|a|an)\s+/i, "");
const initial = (value) => (sortValue(value).match(/[a-z0-9]/i)?.[0] || "#").toUpperCase();
const slugify = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "actress";
const seededNames = new Set(seed.actresses.map((item) => item.name.toLowerCase()));
const usedSlugs = new Set(seed.actresses.map((item) => item.slug));
const directoryActresses = allActressNames.filter((name) => !seededNames.has(name.toLowerCase())).map((name) => {
  const base = slugify(name);
  const slug = usedSlugs.has(base) ? `${base}-${createHash("sha1").update(name).digest("hex").slice(0, 8)}` : base;
  usedSlugs.add(slug);
  return { name, slug };
});

try {
  console.log(`Importing ${seed.actresses.length} published actresses`);
  for (const batch of chunks(seed.actresses)) {
    await prisma.$transaction(batch.map((item) => prisma.actress.upsert({
      where: { id: item.id },
      create: { id: item.id, name: item.name, slug: item.slug, sortName: sortValue(item.name), initial: initial(item.name), profileImage: item.profileImageKey, seoTitle: item.seoTitle, seoDescription: item.seoDescription, rank: actressRankById.get(item.id), videoCount: 0, isPublished: item.status === "ACTIVE" },
      update: { name: item.name, slug: item.slug, sortName: sortValue(item.name), initial: initial(item.name), profileImage: item.profileImageKey, seoTitle: item.seoTitle, seoDescription: item.seoDescription, isPublished: item.status === "ACTIVE" },
    })));
  }

  console.log(`Importing ${directoryActresses.length} admin-directory actress names`);
  let directoryDone = 0;
  for (const batch of chunks(directoryActresses, 1000)) {
    await prisma.actress.createMany({
      data: batch.map((item) => ({
        id: `actdir_${createHash("sha1").update(item.name).digest("hex").slice(0, 20)}`,
        name: item.name,
        slug: item.slug,
        sortName: sortValue(item.name),
        initial: initial(item.name),
        videoCount: 0,
        isPublished: false,
      })),
      skipDuplicates: true,
    });
    directoryDone += batch.length;
    console.log(`Admin-directory names checked: ${directoryDone}/${directoryActresses.length}`);
  }

  console.log(`Importing ${seed.works.length} works`);
  for (const batch of chunks(seed.works)) {
    await prisma.$transaction(batch.map((item) => prisma.work.upsert({
      where: { id: item.id },
      create: { id: item.id, title: item.title, slug: item.slug, sortTitle: sortValue(item.title), initial: initial(item.title), type: item.type, releaseYear: item.releaseYear, description: item.description, seoTitle: item.seoTitle, seoDescription: item.seoDescription, videoCount: 0, isPublished: true },
      update: { title: item.title, slug: item.slug, sortTitle: sortValue(item.title), initial: initial(item.title), type: item.type, releaseYear: item.releaseYear, description: item.description, seoTitle: item.seoTitle, seoDescription: item.seoDescription, isPublished: true },
    })));
  }

  console.log(`Importing ${seed.tags.length} tags`);
  for (const batch of chunks(seed.tags)) {
    await prisma.$transaction(batch.map((item) => prisma.tag.upsert({
      where: { id: item.id },
      create: { id: item.id, name: item.name, slug: item.slug, seoTitle: item.seoTitle, seoDescription: item.seoDescription, videoCount: 0 },
      update: { name: item.name, slug: item.slug, seoTitle: item.seoTitle, seoDescription: item.seoDescription },
    })));
  }

  console.log(`Importing ${seed.videos.length} videos`);
  for (const batch of chunks(seed.videos, 25)) {
    await prisma.$transaction(batch.map((item) => {
      const file = localById.get(item.id);
      return prisma.video.upsert({
        where: { id: item.id },
        create: { id: item.id, title: item.title, slug: item.slug, description: item.description, durationSeconds: item.durationSeconds, year: item.year, seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber, workId: item.workId, seoTitle: item.seoTitle, seoDescription: item.seoDescription, seoKeywords: item.seoKeywords, status: file ? "READY" : "DRAFT", isShort: false, videoUrl: file ? `/api/local-media/video/${item.id}` : item.videoUrl, thumbnailUrl: `/api/local-media/thumbnail/${item.id}`, publishedAt: file ? new Date(file.downloadedAt) : null },
        update: { title: item.title, slug: item.slug, description: item.description, durationSeconds: item.durationSeconds, year: item.year, seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber, workId: item.workId, seoTitle: item.seoTitle, seoDescription: item.seoDescription, seoKeywords: item.seoKeywords, status: file ? "READY" : "DRAFT", videoUrl: file ? `/api/local-media/video/${item.id}` : item.videoUrl, thumbnailUrl: `/api/local-media/thumbnail/${item.id}`, publishedAt: file ? new Date(file.downloadedAt) : null },
      });
    }));
  }

  console.log("Importing relationships and source metadata");
  await prisma.videoActress.createMany({ data: seed.videoActresses, skipDuplicates: true });
  await prisma.videoTag.createMany({ data: seed.videoTags, skipDuplicates: true });
  await prisma.videoSource.createMany({ data: seed.videoSources.map((item) => ({ id: item.id, videoId: item.videoId, provider: item.provider, sourcePageUrl: item.watchUrl, sourceMediaUrl: item.directFileUrl })), skipDuplicates: true });

  await prisma.$executeRawUnsafe(`UPDATE "Actress" a SET "videoCount" = (SELECT count(*)::int FROM "VideoActress" va JOIN "Video" v ON v.id = va."videoId" WHERE va."actressId" = a.id AND v.status = 'READY')`);
  await prisma.$executeRawUnsafe(`UPDATE "Work" w SET "videoCount" = (SELECT count(*)::int FROM "Video" v WHERE v."workId" = w.id AND v.status = 'READY')`);
  await prisma.$executeRawUnsafe(`UPDATE "Tag" t SET "videoCount" = (SELECT count(*)::int FROM "VideoTag" vt JOIN "Video" v ON v.id = vt."videoId" WHERE vt."tagId" = t.id AND v.status = 'READY')`);
  await prisma.$executeRawUnsafe(`INSERT INTO "YearStat" (year, "videoCount", "updatedAt") SELECT year, count(*)::int, now() FROM "Video" WHERE status = 'READY' AND year IS NOT NULL GROUP BY year ON CONFLICT (year) DO UPDATE SET "videoCount" = EXCLUDED."videoCount", "updatedAt" = now()`);

  const [videoCount, actressCount, movieCount, tvSeriesCount, tagCount] = await Promise.all([
    prisma.video.count({ where: { status: "READY", isShort: false } }),
    prisma.actress.count({ where: { isPublished: true, videoCount: { gt: 0 } } }),
    prisma.work.count({ where: { isPublished: true, type: "MOVIE", videoCount: { gt: 0 } } }),
    prisma.work.count({ where: { isPublished: true, type: "TV_SHOW", videoCount: { gt: 0 } } }),
    prisma.tag.count({ where: { videoCount: { gt: 0 } } }),
  ]);
  await prisma.catalogStats.upsert({ where: { id: "primary" }, create: { id: "primary", videoCount, actressCount, movieCount, tvSeriesCount, tagCount }, update: { videoCount, actressCount, movieCount, tvSeriesCount, tagCount } });
  console.log(`PostgreSQL catalogue ready: ${videoCount} videos, ${actressCount} public actresses, ${allActressNames.length} admin-directory names, ${movieCount + tvSeriesCount} works, ${tagCount} tags.`);
} finally {
  await prisma.$disconnect();
}
