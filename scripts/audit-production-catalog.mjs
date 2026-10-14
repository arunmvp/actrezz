import { createDb } from "./lib/db.mjs";

const db = createDb();
try {
  const [byStatus, publicNormalVideos, stats, staged, readySources] = await Promise.all([
    db.video.groupBy({ by: ["status", "mediaReady"], _count: { _all: true } }),
    db.video.count({ where: { status: "READY", mediaReady: true, isShort: false } }),
    db.catalogStats.findUnique({ where: { id: "primary" } }),
    db.video.count({ where: { status: "PROCESSING" } }),
    db.videoSource.count({ where: { video: { status: "READY", mediaReady: true } } }),
  ]);
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    byStatus,
    publicNormalVideos,
    stagedProcessingVideos: staged,
    readyVideoSources: readySources,
    catalogStats: stats,
  }, null, 2));
} finally {
  await db.$disconnect();
}
