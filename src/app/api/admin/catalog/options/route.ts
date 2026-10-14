import { NextResponse } from "next/server";
import { WorkType } from "@prisma/client";
import { db } from "@/lib/db";
import { jsonError, noStore, requireAdmin } from "@/lib/admin/catalog-admin";
import { r2Ready } from "@/lib/r2-presign";
import { unstable_cache } from "next/cache";
import { CATALOG_CACHE, PUBLIC_VIDEO_WHERE } from "@/lib/catalog-policy";
import { parsePageParam } from "@/lib/pagination";

const lookup = unstable_cache(async (kind: string, q: string, page: number) => {
  const contains = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const pageSize = 40;
  const paging = { take: pageSize + 1, skip: (page - 1) * pageSize };
  const rows = kind === "actress" ? await db.actress.findMany({ where: contains ? { name: contains } : undefined, orderBy: [{ sortName: "asc" }, { id: "asc" }], ...paging, select: { id: true, name: true, slug: true, videoCount: true, profileImage: true } })
    : kind === "work" ? await db.work.findMany({ where: contains ? { title: contains } : undefined, orderBy: [{ sortTitle: "asc" }, { id: "asc" }], ...paging, select: { id: true, title: true, slug: true, type: true, releaseYear: true, videoCount: true } })
    : await db.tag.findMany({ where: contains ? { name: contains } : undefined, orderBy: [{ name: "asc" }, { id: "asc" }], ...paging, select: { id: true, name: true, slug: true, videoCount: true } });
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page };
}, ["admin-lookup-v2"], CATALOG_CACHE);

export const runtime = "nodejs";

function like(value: string) {
  return value.trim().replace(/[%_]/g, "").slice(0, 80);
}

export async function GET(request: Request) {
  if (!(await requireAdmin())) return jsonError("Unauthorized.", 401);
  const url = new URL(request.url);
  const q = like(url.searchParams.get("q") || "");
  const kind = url.searchParams.get("kind") || "all";
  if (["actress", "work", "tag"].includes(kind)) {
    try { return noStore(NextResponse.json(await lookup(kind, q, parsePageParam(url.searchParams.get("page") || undefined)))); }
    catch { return jsonError("Unable to load choices. Please retry.", 503); }
  }
  const contains = q ? { contains: q, mode: "insensitive" as const } : undefined;

  const [stats, actresses, works, tags, recentVideos, shortCount] = await Promise.all([
    db.catalogStats.findUnique({ where: { id: "primary" } }),
    kind === "all" || kind === "actress"
      ? db.actress.findMany({
        where: contains ? { name: contains } : undefined,
        orderBy: [{ videoCount: "desc" }, { sortName: "asc" }],
        take: 40,
        select: { id: true, name: true, slug: true, videoCount: true, profileImage: true },
      })
      : Promise.resolve([]),
    kind === "all" || kind === "work"
      ? db.work.findMany({
        where: contains ? { title: contains } : undefined,
        orderBy: [{ videoCount: "desc" }, { sortTitle: "asc" }],
        take: 40,
        select: { id: true, title: true, slug: true, type: true, releaseYear: true, videoCount: true },
      })
      : Promise.resolve([]),
    kind === "all" || kind === "tag"
      ? db.tag.findMany({
        where: contains ? { name: contains } : undefined,
        orderBy: [{ videoCount: "desc" }, { name: "asc" }],
        take: 60,
        select: { id: true, name: true, slug: true, videoCount: true },
      })
      : Promise.resolve([]),
    kind === "all"
      ? db.video.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 8,
        select: {
          id: true, title: true, slug: true, status: true, isShort: true, thumbnailUrl: true,
          actresses: { take: 2, select: { actress: { select: { name: true } } } },
        },
      })
      : Promise.resolve([]),
    db.video.count({ where: { isShort: true, ...PUBLIC_VIDEO_WHERE } }),
  ]);

  return noStore(NextResponse.json({
    stats: {
      videoCount: stats?.videoCount ?? 0,
      actressCount: stats?.actressCount ?? 0,
      movieCount: stats?.movieCount ?? 0,
      tvSeriesCount: stats?.tvSeriesCount ?? 0,
      tagCount: stats?.tagCount ?? 0,
      shortCount,
    },
    readiness: {
      database: true,
      r2: r2Ready(),
      mediaDomain: /^https:\/\//.test(process.env.NEXT_PUBLIC_MEDIA_URL || ""),
      shortsIndexable: shortCount > 0,
    },
    actresses,
    works: works.map((work) => ({
      ...work,
      label: `${work.title}${work.releaseYear ? ` (${work.releaseYear})` : ""}`,
      typeLabel: work.type === WorkType.MOVIE ? "Movie" : "TV series",
    })),
    tags,
    recentVideos: recentVideos.map((video) => ({
      ...video,
      actresses: video.actresses.map((item) => item.actress.name),
    })),
  }));
}
