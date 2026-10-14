import { createDb } from "./lib/db.mjs";
import { checkR2 } from "./lib/r2-audit-client.mjs";

// Reconcile Actress.profileImage against R2. When the stored image key does not
// exist in R2 (HTTP 404), clear the DB field so the public UI renders the
// initials placeholder instead of requesting a missing object (which produced a
// flood of 404s such as /actresses/<slug>/profile.webp).
//
// Dry-run by default. Pass --apply to write NULLs.

const apply = process.argv.includes("--apply");
const concurrency = 8;
const prisma = createDb();

function keyFor(row) {
  const raw = row.profileImage;
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try { return decodeURIComponent(new URL(raw).pathname.replace(/^\/+/, "")); } catch { return null; }
  }
  if (raw.startsWith("/api/")) return null; // proxied path, skip verification
  return raw.replace(/^media\/actresses\//, "actresses/");
}

try {
  const rows = await prisma.actress.findMany({
    where: { profileImage: { not: null } },
    select: { id: true, slug: true, profileImage: true },
    orderBy: { id: "asc" },
  });

  console.log(`Actresses with profileImage set: ${rows.length}`);

  const missing = [];
  const unverifiable = [];
  let cursor = 0;
  let checked = 0;

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const key = keyFor(row);
      if (!key) { unverifiable.push({ id: row.id, slug: row.slug, reason: "unresolvable-key" }); continue; }
      try {
        const result = await checkR2(key);
        checked += 1;
        if (!result.exists) missing.push({ id: row.id, slug: row.slug, key, status: result.status });
      } catch (error) {
        unverifiable.push({ id: row.id, slug: row.slug, key, reason: error.message });
      }
    }
  }));

  console.log(`Checked in R2: ${checked}`);
  console.log(`Missing in R2 (would clear): ${missing.length}`);
  console.log(`Unverifiable (left untouched): ${unverifiable.length}`);
  for (const m of missing.slice(0, 15)) console.log(`  missing ${m.status}: ${m.slug} -> ${m.key}`);
  if (missing.length > 15) console.log(`  ...${missing.length - 15} more`);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to clear the missing profileImage fields.");
    process.exit(0);
  }

  if (missing.length === 0) {
    console.log("\nNothing to clear.");
    process.exit(0);
  }

  const ids = missing.map((m) => m.id);
  const chunk = (arr, size = 1000) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));
  let cleared = 0;
  for (const batch of chunk(ids)) {
    const result = await prisma.actress.updateMany({ where: { id: { in: batch } }, data: { profileImage: null } });
    cleared += result.count;
  }
  console.log(`\nCleared profileImage on ${cleared} actresses. UI will now show initials for them.`);
} finally {
  await prisma.$disconnect();
}
