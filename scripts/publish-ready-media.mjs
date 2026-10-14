import { createDb } from "./lib/db.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Publishes videos that have verified R2 media but are still staged as PROCESSING.
// Mirrors the admin catalog publish path: status -> READY, publishedAt set once,
// then recomputes videoCount / YearStat / CatalogStats and publishes referenced
// actresses/works so public queries (isPublished + videoCount > 0) surface them.
//
// Safe by design:
//   - Only touches rows where status = 'PROCESSING' AND mediaReady = TRUE.
//   - Never changes already-READY rows or DRAFT/FAILED rows.
//   - Dry-run unless --apply is passed.

const apply = process.argv.includes("--apply");
const refreshStats = process.argv.includes("--refresh-stats");
const seedDirOption = process.argv.find((arg) => arg.startsWith("--seed-dir="));
const seedDir = seedDirOption ? path.resolve(seedDirOption.slice("--seed-dir=".length)) : "";
const targetIds = seedDir ? new Set(JSON.parse(await readFile(path.join(seedDir, "database-seed.delta.json"), "utf8")).videos.map((item) => item.id)) : null;
const prisma = createDb();

try {
  const candidates = await prisma.video.findMany({
    where: { status: "PROCESSING", mediaReady: true, ...(targetIds ? { id: { in: [...targetIds] } } : {}) },
    select: { id: true, publishedAt: true },
  });

  const notReadyYet = await prisma.video.count({
    where: { status: "PROCESSING", mediaReady: false, ...(targetIds ? { id: { in: [...targetIds] } } : {}) },
  });

  const summary = {
    mode: apply ? "publish-apply" : "publish-dry-run",
    mutatesDatabase: apply,
    scopedToSeed: Boolean(targetIds),
    candidatesToPublish: candidates.length,
    stillProcessingWithoutMedia: notReadyYet,
  };

  if (!apply) {
    console.log(JSON.stringify({
      ...summary,
      message: "Dry run only. Re-run with --apply to publish these videos.",
    }, null, 2));
    process.exit(0);
  }

  if (candidates.length === 0 && !refreshStats) {
    console.log(JSON.stringify({ ...summary, message: "Nothing to publish." }, null, 2));
    process.exit(0);
  }

  const ids = candidates.map((row) => row.id);
  const needPublishedAt = candidates.filter((row) => !row.publishedAt).map((row) => row.id);

  const chunk = (items, size = 1000) => Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  );

  // Flip status -> READY (and stamp publishedAt only where missing).
  let published = 0;
  for (const batch of chunk(ids)) {
    const result = await prisma.video.updateMany({
      where: { id: { in: batch }, status: "PROCESSING", mediaReady: true },
      data: { status: "READY" },
    });
    published += result.count;
  }
  for (const batch of chunk(needPublishedAt)) {
    if (batch.length === 0) continue;
    await prisma.video.updateMany({
      where: { id: { in: batch }, publishedAt: null },
      data: { publishedAt: new Date() },
    });
  }

  // Publish actresses/works that now have at least one public video.
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Actress" a SET "videoCount"=(SELECT COUNT(*)::int FROM "VideoActress" va JOIN "Video" v ON v.id=va."videoId" WHERE va."actressId"=a.id AND v.status='READY' AND v."mediaReady" AND NOT v."isShort")`,
    prisma.$executeRaw`UPDATE "Work" w SET "videoCount"=(SELECT COUNT(*)::int FROM "Video" v WHERE v."workId"=w.id AND v.status='READY' AND v."mediaReady" AND NOT v."isShort")`,
    prisma.$executeRaw`UPDATE "Tag" t SET "videoCount"=(SELECT COUNT(*)::int FROM "VideoTag" vt JOIN "Video" v ON v.id=vt."videoId" WHERE vt."tagId"=t.id AND v.status='READY' AND v."mediaReady" AND NOT v."isShort")`,
    prisma.$executeRaw`UPDATE "YearStat" y SET "videoCount"=(SELECT COUNT(*)::int FROM "Video" v WHERE v.year=y.year AND v.status='READY' AND v."mediaReady" AND NOT v."isShort")`,
    prisma.$executeRaw`INSERT INTO "YearStat" (year, "videoCount", "updatedAt") SELECT year, COUNT(*)::int, now() FROM "Video" WHERE status='READY' AND "mediaReady" AND NOT "isShort" AND year IS NOT NULL GROUP BY year ON CONFLICT (year) DO UPDATE SET "videoCount"=EXCLUDED."videoCount", "updatedAt"=now()`,
    prisma.$executeRaw`UPDATE "Actress" SET "isPublished"=TRUE WHERE "videoCount">0`,
    prisma.$executeRaw`UPDATE "Work" SET "isPublished"=TRUE WHERE "videoCount">0`,
    prisma.$executeRaw`UPDATE "CatalogStats" SET "videoCount"=(SELECT COUNT(*)::int FROM "Video" WHERE status='READY' AND "mediaReady" AND NOT "isShort"), "actressCount"=(SELECT COUNT(*)::int FROM "Actress" WHERE "isPublished" AND "videoCount">0), "movieCount"=(SELECT COUNT(*)::int FROM "Work" WHERE "isPublished" AND "videoCount">0 AND type='MOVIE'), "tvSeriesCount"=(SELECT COUNT(*)::int FROM "Work" WHERE "isPublished" AND "videoCount">0 AND type='TV_SHOW'), "tagCount"=(SELECT COUNT(*)::int FROM "Tag" WHERE "videoCount">0) WHERE id='primary'`,
  ], { maxWait: 10_000, timeout: 60_000 });

  const stats = await prisma.catalogStats.findUnique({ where: { id: "primary" } });
  const publicVideos = await prisma.video.count({ where: { status: "READY", mediaReady: true, isShort: false } });

  console.log(JSON.stringify({
    ...summary,
    published,
    publicVideosNow: publicVideos,
    catalogStats: stats,
    next: "Rebuild/redeploy and refresh sitemaps (npm run seo:indexnow).",
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
