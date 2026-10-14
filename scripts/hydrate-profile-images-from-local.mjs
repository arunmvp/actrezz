import fs from "node:fs";
import path from "node:path";
import { createDb } from "./lib/db.mjs";

const appRoot = process.cwd();
const projectRoot = path.resolve(appRoot, "..");
const mediaRoot = path.join(projectRoot, "media", "actresses");
const apply = process.argv.includes("--apply");
const bulk = process.argv.includes("--bulk") || apply;
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Math.max(0, Number(limitArg.slice("--limit=".length)) || 0) : 0;

function listLocalProfileSlugs() {
  if (!fs.existsSync(mediaRoot)) return [];
  return fs.readdirSync(mediaRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => fs.existsSync(path.join(mediaRoot, slug, "profile.webp")))
    .sort((a, b) => a.localeCompare(b));
}

const prisma = createDb();

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

try {
  const localSlugs = listLocalProfileSlugs();
  const rows = await prisma.actress.findMany({
    where: { slug: { in: localSlugs } },
    select: { id: true, slug: true, name: true, profileImage: true, videoCount: true },
  });
  const expectedBySlug = new Map(localSlugs.map((slug) => [slug, `media/actresses/${slug}/profile.webp`]));
  const updates = rows
    .map((row) => ({ ...row, expectedProfileImage: expectedBySlug.get(row.slug) }))
    .filter((row) => row.expectedProfileImage && row.profileImage !== row.expectedProfileImage);
  const selected = limit ? updates.slice(0, limit) : updates;

  if (apply) {
    let updated = 0;
    if (bulk) {
      for (let index = 0; index < selected.length; index += 250) {
        const batch = selected.slice(index, index + 250);
        const values = batch.map((row) => {
          if (!/^[a-z0-9-]+$/.test(row.slug)) throw new Error(`Unexpected actress slug: ${row.slug}`);
          return `(${sqlString(row.id)}, ${sqlString(row.expectedProfileImage)})`;
        }).join(",");
        if (!values) continue;
        updated += await prisma.$executeRawUnsafe(`
          UPDATE "Actress" AS a
          SET "profileImage" = v.profile_image
          FROM (VALUES ${values}) AS v(id, profile_image)
          WHERE a.id = v.id
        `);
      }
    } else {
      for (const row of selected) {
        const result = await prisma.actress.updateMany({
          where: { id: row.id },
          data: { profileImage: row.expectedProfileImage },
        });
        updated += result.count;
      }
    }
    console.log(JSON.stringify({
      mode: "hydrate-profile-images",
      applied: true,
      localProfileFiles: localSlugs.length,
      matchingActresses: rows.length,
      updatesNeeded: updates.length,
      updated,
      sample: selected.slice(0, 10).map((row) => ({ slug: row.slug, from: row.profileImage, to: row.expectedProfileImage })),
    }, null, 2));
  } else {
    console.log(JSON.stringify({
      mode: "hydrate-profile-images",
      applied: false,
      localProfileFiles: localSlugs.length,
      matchingActresses: rows.length,
      updatesNeeded: updates.length,
      sample: updates.slice(0, 20).map((row) => ({ slug: row.slug, from: row.profileImage, to: row.expectedProfileImage })),
      next: "Run with --apply to update production profileImage fields.",
    }, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
