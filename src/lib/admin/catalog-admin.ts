import "server-only";

import { cookies } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { Prisma, VideoStatus, WorkType } from "@prisma/client";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { PUBLIC_VIDEO_WHERE } from "@/lib/catalog-policy";
import { videoMedia } from "@/lib/media";

export function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function requireAdmin(request?: Request) {
  if (request && !["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin && origin !== process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")) return false;
    if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  }
  const cookieStore = await cookies();
  const isAdmin = await verifyAdminSession(cookieStore.get(ADMIN_COOKIE)?.value);
  return isAdmin;
}

export function jsonError(message: string, status = 400) {
  return noStore(NextResponse.json({ error: message }, { status }));
}

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "item";
}

export function sortValue(value: string) {
  return value.toLowerCase().replace(/^(the|a|an)\s+/i, "").trim();
}

export function initialFor(value: string) {
  const first = sortValue(value).replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase();
  return /^[A-Z0-9]$/.test(first) ? first : "#";
}

export async function uniqueVideoSlug(base: string) {
  const clean = slugify(base);
  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? clean : `${clean}-${index + 1}`;
    const exists = await db.video.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${clean}-${Date.now()}`;
}

export async function uniqueActressSlug(name: string) {
  const clean = slugify(name);
  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? clean : `${clean}-${index + 1}`;
    const exists = await db.actress.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${clean}-${Date.now()}`;
}

export async function upsertWork(input: { title: string; type: WorkType; releaseYear?: number | null; description?: string | null }, client: Prisma.TransactionClient = db) {
  const title = input.title.trim();
  const slug = slugify(title);
  return client.work.upsert({
    where: { type_slug: { type: input.type, slug } },
    create: {
      title,
      slug,
      sortTitle: sortValue(title),
      initial: initialFor(title),
      type: input.type,
      releaseYear: input.releaseYear ?? null,
      description: input.description?.trim() || null,
      isPublished: true,
    },
    update: {
      releaseYear: input.releaseYear ?? undefined,
      description: input.description?.trim() || undefined,
      isPublished: true,
    },
    select: { id: true, title: true, slug: true, type: true },
  });
}

export async function upsertTags(names: string[], client: Prisma.TransactionClient = db) {
  const cleanNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 20);
  const tags: Array<{ id: string; name: string; slug: string }> = [];
  for (const name of cleanNames) {
    const slug = slugify(name);
    tags.push(await client.tag.upsert({
      where: { slug },
      create: { name, slug },
      update: { name },
      select: { id: true, name: true, slug: true },
    }));
  }
  return tags;
}

export async function refreshCounts(ids: {
  actressIds?: string[];
  workId?: string | null;
  tagIds?: string[];
  year?: number | null;
}, client: Prisma.TransactionClient = db) {
  await Promise.all([
    ...(ids.actressIds ?? []).map(async (id) => client.actress.update({
      where: { id },
      data: {
        videoCount: await client.video.count({ where: { ...PUBLIC_VIDEO_WHERE, isShort: false, actresses: { some: { actressId: id } } } }),
        isPublished: true,
      },
    })),
    ids.workId ? (async () => client.work.update({
      where: { id: ids.workId! },
      data: {
        videoCount: await client.video.count({ where: { ...PUBLIC_VIDEO_WHERE, isShort: false, workId: ids.workId! } }),
        isPublished: true,
      },
    }))() : Promise.resolve(),
    ...(ids.tagIds ?? []).map(async (id) => client.tag.update({
      where: { id },
      data: { videoCount: await client.video.count({ where: { ...PUBLIC_VIDEO_WHERE, isShort: false, tags: { some: { tagId: id } } } }) },
    })),
    ids.year ? (async () => client.yearStat.upsert({
      where: { year: ids.year! },
      create: { year: ids.year!, videoCount: await client.video.count({ where: { ...PUBLIC_VIDEO_WHERE, isShort: false, year: ids.year! } }) },
      update: { videoCount: await client.video.count({ where: { ...PUBLIC_VIDEO_WHERE, isShort: false, year: ids.year! } }) },
    }))() : Promise.resolve(),
  ]);

  const [videoCount, actressCount, movieCount, tvSeriesCount, tagCount] = await Promise.all([
    client.video.count({ where: { ...PUBLIC_VIDEO_WHERE, isShort: false } }),
    client.actress.count({ where: { isPublished: true, videoCount: { gt: 0 } } }),
    client.work.count({ where: { type: WorkType.MOVIE, isPublished: true, videoCount: { gt: 0 } } }),
    client.work.count({ where: { type: WorkType.TV_SHOW, isPublished: true, videoCount: { gt: 0 } } }),
    client.tag.count({ where: { videoCount: { gt: 0 } } }),
  ]);

  await client.catalogStats.upsert({
    where: { id: "primary" },
    create: { id: "primary", videoCount, actressCount, movieCount, tvSeriesCount, tagCount },
    update: { videoCount, actressCount, movieCount, tvSeriesCount, tagCount },
  });

}

export function invalidateCatalog(item?: { slug: string; isShort: boolean }) {
  revalidateTag("catalog", { expire: 0 });
  revalidatePath("/", "layout");
  revalidatePath("/actresses", "page");
  revalidatePath("/movies", "page");
  revalidatePath("/tv-series", "page");
  revalidatePath("/tags", "page");
  revalidatePath("/years", "page");
  revalidatePath("/sitemap.xml");
  revalidatePath("/video-sitemap.xml");
  revalidatePath("/shorties-tags-sitemap.xml");
  revalidatePath("/robots.txt");
  revalidatePath("/shorts", "layout");
  revalidatePath("/watch/[videoId]", "page");
  revalidatePath("/actress/[channelId]", "page");
  revalidatePath("/movie/[slug]", "page");
  revalidatePath("/tv-series/[slug]", "page");
  revalidatePath("/tag/[slug]", "page");
  revalidatePath("/year/[year]", "page");
  if (item) revalidatePath(`/${item.isShort ? "shorts" : "watch"}/${item.slug}`);
}

export function parseStatus(value: unknown) {
  if (value === "READY" || value === "DRAFT" || value === "PROCESSING" || value === "HIDDEN" || value === "FAILED") {
    return value as VideoStatus;
  }
  return VideoStatus.DRAFT;
}

export function serializeVideo(row: Prisma.VideoGetPayload<{
  include: {
    work: true;
    actresses: { include: { actress: true } };
    tags: { include: { tag: true } };
  };
}>) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    seoKeywords: row.seoKeywords,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    mediaReady: row.mediaReady,
    durationSeconds: row.durationSeconds,
    year: row.year,
    status: row.status,
    isShort: row.isShort,
    ...videoMedia(row),
    r2VideoKey: row.r2VideoKey,
    r2ThumbnailKey: row.r2ThumbnailKey,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    work: row.work ? { id: row.work.id, title: row.work.title, type: row.work.type, slug: row.work.slug } : null,
    actresses: row.actresses.map((item) => ({ id: item.actress.id, name: item.actress.name, slug: item.actress.slug })),
    tags: row.tags.map((item) => ({ id: item.tag.id, name: item.tag.name, slug: item.tag.slug })),
  };
}
