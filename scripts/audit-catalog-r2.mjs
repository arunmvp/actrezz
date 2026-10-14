import { createDb } from "./lib/db.mjs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkR2 } from "./lib/r2-audit-client.mjs";

const prisma = createDb();
const apply = process.argv.includes("--apply");
const seedDirOption = process.argv.find((arg) => arg.startsWith("--seed-dir="));
const seedDir = seedDirOption ? path.resolve(seedDirOption.slice("--seed-dir=".length)) : "";
const targetIds = seedDir ? new Set(JSON.parse(await readFile(path.join(seedDir, "database-seed.delta.json"), "utf8")).videos.map((item) => item.id)) : null;

try {
  const rows = await prisma.video.findMany({ where: targetIds ? { id: { in: [...targetIds] } } : undefined, select: { id: true, status: true, r2VideoKey: true, r2ThumbnailKey: true, videoUrl: true, thumbnailUrl: true }, orderBy: { id: "asc" } });
  let cursor = 0;
  const results = [];
  const keyFrom = (explicit, url, fallback) => explicit || (url?.startsWith("/api/r2-media/") ? decodeURIComponent(url.slice(14)) : null) || fallback;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const videoKey = keyFrom(row.r2VideoKey, row.videoUrl, `videos/${row.id}.mp4`);
      const thumbnailKey = keyFrom(row.r2ThumbnailKey, row.thumbnailUrl, `thumbnails/${row.id}.webp`);
      const [video, thumbnail] = await Promise.all([checkR2(videoKey, true), checkR2(thumbnailKey)]);
      const ready = video.exists && video.range && thumbnail.exists && thumbnail.bytes > 0;
      results.push({ id: row.id, status: row.status, video: video.status, range: video.range, thumbnail: thumbnail.status, ready });
      if (apply) await prisma.video.update({ where: { id: row.id }, data: { mediaReady: ready, mediaCheckedAt: new Date(), ...(ready ? { r2VideoKey: videoKey, r2ThumbnailKey: thumbnailKey } : {}) } });
    }
  }));
  if (apply) {
    // Recompute only on explicit reconciliation, never on a public page request.
    await prisma.$transaction([
      prisma.$executeRaw`UPDATE "Actress" a SET "videoCount"=(SELECT COUNT(*)::int FROM "VideoActress" va JOIN "Video" v ON v.id=va."videoId" WHERE va."actressId"=a.id AND v.status='READY' AND v."mediaReady" AND NOT v."isShort")`,
      prisma.$executeRaw`UPDATE "Work" w SET "videoCount"=(SELECT COUNT(*)::int FROM "Video" v WHERE v."workId"=w.id AND v.status='READY' AND v."mediaReady" AND NOT v."isShort")`,
      prisma.$executeRaw`UPDATE "Tag" t SET "videoCount"=(SELECT COUNT(*)::int FROM "VideoTag" vt JOIN "Video" v ON v.id=vt."videoId" WHERE vt."tagId"=t.id AND v.status='READY' AND v."mediaReady" AND NOT v."isShort")`,
      prisma.$executeRaw`UPDATE "YearStat" y SET "videoCount"=(SELECT COUNT(*)::int FROM "Video" v WHERE v.year=y.year AND v.status='READY' AND v."mediaReady" AND NOT v."isShort")`,
      prisma.$executeRaw`UPDATE "CatalogStats" SET "videoCount"=(SELECT COUNT(*)::int FROM "Video" WHERE status='READY' AND "mediaReady" AND NOT "isShort"), "actressCount"=(SELECT COUNT(*)::int FROM "Actress" WHERE "isPublished" AND "videoCount">0), "movieCount"=(SELECT COUNT(*)::int FROM "Work" WHERE "isPublished" AND "videoCount">0 AND type='MOVIE'), "tvSeriesCount"=(SELECT COUNT(*)::int FROM "Work" WHERE "isPublished" AND "videoCount">0 AND type='TV_SHOW'), "tagCount"=(SELECT COUNT(*)::int FROM "Tag" WHERE "videoCount">0)`
    ]);
  }
  const report = { checkedAt: new Date().toISOString(), applied: apply, scopedToSeed: Boolean(targetIds), records: rows.length, verified: results.filter((row) => row.ready).length, missing: results.filter((row) => !row.ready), published: results.filter((row) => row.ready && row.status === "READY").length, withVideoKeyBefore: rows.filter((row) => row.r2VideoKey).length, withThumbnailKeyBefore: rows.filter((row) => row.r2ThumbnailKey).length };
  await writeFile(new URL("../docs/R2-CATALOG-AUDIT.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (report.missing.some((row) => row.status === "READY")) process.exitCode = 1;
} catch (error) {
  console.error(`Catalogue audit failed (${error.code || error.name}); no credentials were logged. Check connectivity and migration status.`);
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
