import { readFile } from "node:fs/promises";
import { createDb } from "./lib/db.mjs";

const apply = process.argv.includes("--apply");
const deltaOnly = process.argv.includes("--delta-only");
const manifestPath = new URL("../../data/actress-profile-images.json", import.meta.url);
const deltaSeedPath = new URL("../../data/celeb-import-2026-09-28-ready/database-seed.delta.json", import.meta.url);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const screenshotKeys = new Set(
  manifest
    .filter((item) => (
      item.status === "success"
      && typeof item.path === "string"
      && /\/contents\/videos_screenshots\//i.test(item.sourceImageUrl || "")
    ))
    .map((item) => `media/${item.path.replace(/^media\//, "")}`),
);
const deltaSeed = deltaOnly ? JSON.parse(await readFile(deltaSeedPath, "utf8")) : null;
const targetKeys = deltaSeed
  ? new Set(deltaSeed.actresses.map((item) => item.profileImageKey || item.profileImage).filter(Boolean))
  : screenshotKeys;

const prisma = createDb();
try {
  const rows = await prisma.actress.findMany({
    where: { profileImage: { in: [...targetKeys] } },
    select: { id: true, slug: true, name: true, profileImage: true },
    orderBy: { name: "asc" },
  });

  console.log(deltaOnly ? `New-import profile keys: ${targetKeys.size}` : `Known video-thumbnail profile keys: ${screenshotKeys.size}`);
  console.log(`Production mappings to clear: ${rows.length}`);
  for (const row of rows.slice(0, 15)) console.log(`  ${row.name} -> ${row.profileImage}`);
  if (rows.length > 15) console.log(`  ...${rows.length - 15} more`);

  if (!apply || rows.length === 0) {
    console.log(apply ? "Nothing to clear." : "Dry run only. Re-run with --apply to clear these mappings.");
    process.exit(0);
  }

  const ids = rows.map((row) => row.id);
  let cleared = 0;
  for (let index = 0; index < ids.length; index += 250) {
    const chunk = ids.slice(index, index + 250);
    const result = await prisma.actress.updateMany({
      where: { id: { in: chunk }, profileImage: { in: [...targetKeys] } },
      data: { profileImage: null },
    });
    cleared += result.count;
  }
  console.log(`Cleared ${cleared} video-thumbnail profile mappings.`);
} finally {
  await prisma.$disconnect();
}
