import "server-only";

import { unstable_cache } from "next/cache";
import { Prisma, VideoStatus, WorkType } from "@prisma/client";
import { db } from "@/lib/db";

export const PAGE_SIZE = 36;
export const MAX_PAGE_SIZE = 60;

function boundedLimit(value?: number) {
  return Math.max(1, Math.min(MAX_PAGE_SIZE, value ?? PAGE_SIZE));
}

export async function listPublishedVideos(options: {
  limit?: number;
  cursor?: string;
  actressId?: string;
  workId?: string;
  tagId?: string;
  year?: number;
  sort?: "latest" | "popular";
} = {}) {
  const limit = boundedLimit(options.limit);
  const where: Prisma.VideoWhereInput = {
    status: VideoStatus.READY,
    isShort: false,
    ...(options.actressId ? { actresses: { some: { actressId: options.actressId } } } : {}),
    ...(options.workId ? { workId: options.workId } : {}),
    ...(options.tagId ? { tags: { some: { tagId: options.tagId } } } : {}),
    ...(options.year ? { year: options.year } : {}),
  };
  const rows = await db.video.findMany({
    where,
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    orderBy: options.sort === "popular"
      ? [{ viewCount: "desc" }, { id: "desc" }]
      : [{ publishedAt: "desc" }, { id: "desc" }],
    select: {
      id: true, slug: true, title: true, durationSeconds: true, year: true,
      thumbnailUrl: true, r2ThumbnailKey: true, publishedAt: true, viewCount: true,
      work: { select: { id: true, title: true, slug: true, type: true } },
      actresses: { orderBy: { sortOrder: "asc" }, take: 4, select: { actress: { select: { id: true, name: true, slug: true, profileImage: true } } } },
    },
  });
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}

export async function listDirectory(kind: "actress" | "movie" | "tv", options: { limit?: number; cursor?: string } = {}) {
  const limit = boundedLimit(options.limit);
  if (kind === "actress") {
    const rows = await db.actress.findMany({
      where: { isPublished: true, videoCount: { gt: 0 } }, take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      orderBy: [{ sortName: "asc" }, { id: "asc" }],
      select: { id: true, name: true, slug: true, profileImage: true, videoCount: true },
    });
    return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
  }
  const rows = await db.work.findMany({
    where: { isPublished: true, videoCount: { gt: 0 }, type: kind === "movie" ? WorkType.MOVIE : WorkType.TV_SHOW },
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    orderBy: [{ sortTitle: "asc" }, { id: "asc" }],
    select: { id: true, title: true, slug: true, releaseYear: true, posterImage: true, videoCount: true },
  });
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}

export const getCatalogStats = unstable_cache(
  () => db.catalogStats.findUnique({ where: { id: "primary" } }),
  ["catalog-stats"],
  { revalidate: 300, tags: ["catalog"] },
);

export async function getWatchVideo(id: string) {
  return db.video.findFirst({
    where: { id, status: VideoStatus.READY, isShort: false },
    select: {
      id: true, slug: true, title: true, description: true, durationSeconds: true, year: true,
      seasonNumber: true, episodeNumber: true, videoUrl: true, r2VideoKey: true,
      thumbnailUrl: true, r2ThumbnailKey: true, seoTitle: true, seoDescription: true,
      publishedAt: true,
      work: { select: { id: true, title: true, slug: true, type: true, description: true } },
      actresses: { orderBy: { sortOrder: "asc" }, select: { actress: { select: { id: true, name: true, slug: true, profileImage: true } } } },
      tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
    },
  });
}

export async function getRelatedVideos(videoId: string, limitValue?: number) {
  const limit = boundedLimit(limitValue);
  return db.$queryRaw<Array<{
    id: string;
    slug: string;
    title: string;
    thumbnailUrl: string | null;
    r2ThumbnailKey: string | null;
    durationSeconds: number | null;
    year: number | null;
    publishedAt: Date | null;
    viewCount: bigint;
    score: number;
  }>>`
    WITH current_video AS (
      SELECT id, "workId", year
      FROM "Video"
      WHERE id = ${videoId} AND status = 'READY' AND "isShort" = FALSE
      LIMIT 1
    ),
    current_actresses AS (
      SELECT "actressId"
      FROM "VideoActress"
      WHERE "videoId" = ${videoId}
    ),
    current_tags AS (
      SELECT "tagId"
      FROM "VideoTag"
      WHERE "videoId" = ${videoId}
    ),
    latest AS (
      SELECT id, 0 AS score
      FROM "Video"
      WHERE status = 'READY' AND "isShort" = FALSE AND id <> ${videoId}
      ORDER BY "publishedAt" DESC NULLS LAST, id DESC
      LIMIT ${limit}
    ),
    candidates AS (
      SELECT v.id, 5 AS score
      FROM "Video" v, current_video c
      WHERE c."workId" IS NOT NULL AND v."workId" = c."workId" AND v.id <> c.id
        AND v.status = 'READY' AND v."isShort" = FALSE
      UNION ALL
      SELECT va."videoId" AS id, 4 AS score
      FROM "VideoActress" va
      WHERE va."actressId" IN (SELECT "actressId" FROM current_actresses)
        AND va."videoId" <> ${videoId}
      UNION ALL
      SELECT vt."videoId" AS id, 2 AS score
      FROM "VideoTag" vt
      WHERE vt."tagId" IN (SELECT "tagId" FROM current_tags)
        AND vt."videoId" <> ${videoId}
      UNION ALL
      SELECT v.id, 1 AS score
      FROM "Video" v, current_video c
      WHERE c.year IS NOT NULL AND v.year = c.year AND v.id <> c.id
        AND v.status = 'READY' AND v."isShort" = FALSE
      UNION ALL
      SELECT id, score FROM latest
    ),
    ranked AS (
      SELECT id, SUM(score)::int AS score
      FROM candidates
      GROUP BY id
    )
    SELECT v.id, v.slug, v.title, v."thumbnailUrl", v."r2ThumbnailKey",
      v."durationSeconds", v.year, v."publishedAt", v."viewCount", ranked.score
    FROM ranked
    JOIN "Video" v ON v.id = ranked.id
    WHERE v.status = 'READY' AND v."isShort" = FALSE
    ORDER BY ranked.score DESC, v."publishedAt" DESC NULLS LAST, v.id DESC
    LIMIT ${limit}
  `;
}

export async function searchPublishedVideos(rawQuery: string, limitValue?: number) {
  const query = rawQuery.trim().replace(/\s+/g, " ").slice(0, 100);
  if (query.length < 2) return [];
  const limit = boundedLimit(limitValue);
  return db.$queryRaw<Array<{ id: string; slug: string; title: string; thumbnailUrl: string | null; durationSeconds: number | null; rank: number }>>`
    SELECT id, slug, title, "thumbnailUrl", "durationSeconds",
      ts_rank("search_vector", websearch_to_tsquery('simple', ${query})) AS rank
    FROM "Video"
    WHERE status = 'READY' AND "isShort" = FALSE
      AND "search_vector" @@ websearch_to_tsquery('simple', ${query})
    ORDER BY rank DESC, "publishedAt" DESC NULLS LAST, id DESC
    LIMIT ${limit}
  `;
}
