import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDb } from "./lib/db.mjs";
import { checkR2 } from "./lib/r2-audit-client.mjs";

const apply = process.argv.includes("--apply");
const prisma = createDb();

try {
  const rows = await prisma.video.findMany({
    where: { isShort: true, id: { startsWith: "shorties_usersporn_" } },
    select: { id: true, status: true, r2VideoKey: true, r2ThumbnailKey: true },
    orderBy: { id: "asc" },
  });
  let cursor = 0;
  const results = [];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const [video, thumbnail] = await Promise.all([
        checkR2(row.r2VideoKey || "", true),
        checkR2(row.r2ThumbnailKey || ""),
      ]);
      const ready = video.exists && video.range && thumbnail.exists && thumbnail.bytes > 0;
      results.push({ id: row.id, status: row.status, video: video.status, thumbnail: thumbnail.status, ready });
      if (apply) await prisma.video.update({ where: { id: row.id }, data: { mediaReady: ready, mediaCheckedAt: new Date() } });
    }
  }));
  const missing = results.filter((item) => !item.ready);
  const report = {
    checkedAt: new Date().toISOString(),
    applied: apply,
    records: rows.length,
    verified: results.length - missing.length,
    missingCount: missing.length,
    missing: missing.slice(0, 100),
  };
  const docsRoot = path.resolve(import.meta.dirname, "..", "docs");
  await mkdir(docsRoot, { recursive: true });
  await writeFile(path.join(docsRoot, "SHORTIES-R2-AUDIT.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (missing.length) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
