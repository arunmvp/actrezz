import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createDb } from "./lib/db.mjs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the PostgreSQL performance audit.");
const prisma = createDb();
const outputPath = path.resolve(import.meta.dirname, "..", "docs", "DB-QUERY-AUDIT.md");

function quoted(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function walk(node, result = []) { result.push(node); for (const child of node.Plans || []) walk(child, result); return result; }

try {
  const [actress, work, tag, yearRow, videoTotal] = await Promise.all([
    prisma.actress.findFirst({ where: { videoCount: { gt: 0 } }, orderBy: { videoCount: "desc" }, select: { id: true } }),
    prisma.work.findFirst({ where: { videoCount: { gt: 0 } }, orderBy: { videoCount: "desc" }, select: { id: true } }),
    prisma.tag.findFirst({ where: { videoCount: { gt: 0 } }, orderBy: { videoCount: "desc" }, select: { id: true } }),
    prisma.yearStat.findFirst({ orderBy: { videoCount: "desc" }, select: { year: true } }),
    prisma.video.count(),
  ]);
  const queries = [
    ["Home latest", `SELECT id, slug, title FROM "Video" WHERE status='READY' AND "isShort"=FALSE ORDER BY "publishedAt" DESC NULLS LAST, id DESC LIMIT 37`],
    ["Actress videos", `SELECT v.id, v.slug FROM "VideoActress" va JOIN "Video" v ON v.id=va."videoId" WHERE va."actressId"=${quoted(actress?.id || "_")} AND v.status='READY' AND v."isShort"=FALSE ORDER BY v."publishedAt" DESC NULLS LAST, v.id DESC LIMIT 37`],
    ["Work videos", `SELECT id, slug FROM "Video" WHERE "workId"=${quoted(work?.id || "_")} AND status='READY' AND "isShort"=FALSE ORDER BY "publishedAt" DESC NULLS LAST, id DESC LIMIT 37`],
    ["Tag videos", `SELECT v.id, v.slug FROM "VideoTag" vt JOIN "Video" v ON v.id=vt."videoId" WHERE vt."tagId"=${quoted(tag?.id || "_")} AND v.status='READY' AND v."isShort"=FALSE ORDER BY v."publishedAt" DESC NULLS LAST, v.id DESC LIMIT 37`],
    ["Year videos", `SELECT id, slug FROM "Video" WHERE year=${Number(yearRow?.year || 2000)} AND status='READY' AND "isShort"=FALSE ORDER BY "publishedAt" DESC NULLS LAST, id DESC LIMIT 37`],
    ["Search", `SELECT id, slug FROM "Video" WHERE status='READY' AND "isShort"=FALSE AND "search_vector" @@ websearch_to_tsquery('simple','movie') ORDER BY ts_rank("search_vector",websearch_to_tsquery('simple','movie')) DESC LIMIT 60`],
  ];

  const lines = ["# PostgreSQL query-plan audit", "", `Generated: ${new Date().toISOString()}`, `Videos in database: ${videoTotal}`, "", "| Query | Execution | Returned | Shared blocks read | Large sequential scan |", "| --- | ---: | ---: | ---: | --- |"];
  let failed = false;
  for (const [name, sql] of queries) {
    const response = await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
    const root = response[0]["QUERY PLAN"][0];
    const nodes = walk(root.Plan);
    const seq = nodes.some((node) => node["Node Type"] === "Seq Scan" && ["Video", "VideoActress", "VideoTag"].includes(node["Relation Name"]));
    const blocks = nodes.reduce((sum, node) => sum + Number(node["Shared Read Blocks"] || 0) + Number(node["Shared Hit Blocks"] || 0), 0);
    const unacceptable = videoTotal >= 5000 && seq;
    if (unacceptable) failed = true;
    lines.push(`| ${name} | ${Number(root["Execution Time"] || 0).toFixed(2)} ms | ${root.Plan["Actual Rows"]} | ${blocks} | ${unacceptable ? "FAIL" : seq ? "Allowed while small" : "No"} |`);
  }
  lines.push("", failed ? "Result: **FAILED — do not deploy.**" : "Result: **PASSED.**");
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(lines.at(-1));
  if (failed) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
