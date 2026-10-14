import { createDb } from "./lib/db.mjs";

const apply = process.argv.includes("--apply");
const prisma = createDb();

const chunks = (items, size = 100) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

async function refreshPublicTagCounts(videoIds) {
  if (!videoIds.length) return { tagsRefreshed: 0 };
  const links = await prisma.videoTag.findMany({
    where: { videoId: { in: videoIds } },
    select: { tagId: true },
    distinct: ["tagId"],
  });
  const tagIds = links.map((link) => link.tagId);
  if (!tagIds.length) return { tagsRefreshed: 0 };

  const grouped = await prisma.videoTag.groupBy({
    by: ["tagId"],
    where: {
      tagId: { in: tagIds },
      video: { status: "READY", mediaReady: true },
    },
    _count: { _all: true },
  });
  const countByTagId = new Map(grouped.map((row) => [row.tagId, row._count._all]));
  for (const batch of chunks(tagIds)) {
    await prisma.$transaction(batch.map((tagId) => prisma.tag.update({
      where: { id: tagId },
      data: { videoCount: countByTagId.get(tagId) || 0 },
    })));
  }
  return { tagsRefreshed: tagIds.length };
}

try {
  const candidates = await prisma.video.findMany({
    where: { isShort: true, id: { startsWith: "shorties_usersporn_" }, status: "PROCESSING", mediaReady: true },
    select: { id: true },
  });
  const waitingForMedia = await prisma.video.count({
    where: { isShort: true, id: { startsWith: "shorties_usersporn_" }, status: "PROCESSING", mediaReady: false },
  });
  const report = { mode: apply ? "publish-apply" : "publish-dry-run", candidatesToPublish: candidates.length, waitingForMedia };
  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }
  const result = await prisma.video.updateMany({
    where: { id: { in: candidates.map((item) => item.id) }, status: "PROCESSING", mediaReady: true },
    data: { status: "READY", publishedAt: new Date() },
  });
  const tagRefresh = await refreshPublicTagCounts(candidates.map((item) => item.id));
  const publicShorts = await prisma.video.count({ where: { isShort: true, status: "READY", mediaReady: true } });
  console.log(JSON.stringify({ ...report, published: result.count, publicShorts, ...tagRefresh }, null, 2));
} finally {
  await prisma.$disconnect();
}
