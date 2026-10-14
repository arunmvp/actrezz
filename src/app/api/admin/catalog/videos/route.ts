import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { jsonError, noStore, parseStatus, refreshCounts, requireAdmin, serializeVideo, uniqueVideoSlug, upsertTags, upsertWork, invalidateCatalog } from "@/lib/admin/catalog-admin";
import { videoInput, r2KeyFromUrl } from "@/lib/admin/validation";
import { verifyPublishMedia } from "@/lib/admin/verify-media";
import { parsePageParam } from "@/lib/pagination";

export const runtime = "nodejs";
const include = { work: true, actresses: { orderBy: { sortOrder: "asc" as const }, include: { actress: true } }, tags: { include: { tag: true } } };

function failure(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return jsonError("This media or slug already belongs to another record.", 409);
    if (error.code === "P2003" || error.code === "P2025") return jsonError("A selected catalogue record no longer exists. Refresh and try again.", 409);
  }
  return jsonError("The catalogue could not be saved. Your existing data is unchanged; please retry.", 503);
}

async function refreshProductionCatalog(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.ADMIN_REFRESH_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!siteUrl || !secret) return;
  let target: URL;
  try {
    target = new URL("/api/admin/catalog/refresh", siteUrl);
    if (target.host === new URL(request.url).host) return;
  } catch {
    return;
  }
  await fetch(target, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source: "admin-catalog-save" }),
    cache: "no-store",
  }).catch(() => {});
}

export async function GET(request: Request) {
  if (!(await requireAdmin())) return jsonError("Unauthorized.", 401);
  const url = new URL(request.url);
  const page = parsePageParam(url.searchParams.get("page") || undefined);
  const limit = Math.min(50, parsePageParam(url.searchParams.get("limit") || "25"));
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const status = url.searchParams.get("status");
  const kind = url.searchParams.get("kind");
  const where = {
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(status && status !== "ALL" ? { status: parseStatus(status) } : {}),
    ...(kind === "shorts" ? { isShort: true } : kind === "videos" ? { isShort: false } : {}),
  };
  try {
    const [rows, total] = await Promise.all([
      db.video.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit, include }),
      db.video.count({ where }),
    ]);
    return noStore(NextResponse.json({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), items: rows.map(serializeVideo) }));
  } catch { return jsonError("Catalogue temporarily unavailable. Please retry.", 503); }
}

async function save(request: Request, edit: boolean) {
  if (!(await requireAdmin(request))) return jsonError("Unauthorized.", 401);
  const parsed = videoInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "Invalid catalogue fields.");
  const body = parsed.data;
  if (edit && !body.id) return jsonError("Video ID is required.");
  const actressIds = [...new Set(body.actressIds)];
  if (!body.isShort && actressIds.length === 0) return jsonError("Choose at least one actress for a normal video.");
  let videoKey: string;
  let thumbnailKey: string;
  try {
    videoKey = r2KeyFromUrl(body.r2VideoKey, body.videoUrl, "videos");
    thumbnailKey = r2KeyFromUrl(body.r2ThumbnailKey, body.thumbnailUrl, "thumbnails");
    if (body.status === "READY") await verifyPublishMedia(videoKey, thumbnailKey);
  } catch (error) {
    return jsonError(error instanceof Error && !error.message.includes("fetch") ? error.message : "Media verification could not reach storage. Save a draft or retry.");
  }
  try {
    const newSlug = edit ? undefined : await uniqueVideoSlug(body.title);
    const video = await db.$transaction(async (tx) => {
      // Serialize catalogue writes so cached counts stay consistent across admins/processes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(817314)`;
      const old = edit ? await tx.video.findUniqueOrThrow({ where: { id: body.id }, include }) : null;
      let workId = body.workId || null;
      if (!workId && body.workTitle) workId = (await upsertWork({ title: body.workTitle, type: body.workType, releaseYear: body.year, description: body.workDescription }, tx)).id;
      const tags = await upsertTags(body.tags, tx);
      const data = {
        title: body.title, description: body.description || null, durationSeconds: body.durationSeconds ?? null,
        year: body.year ?? null, seasonNumber: body.seasonNumber ?? null, episodeNumber: body.episodeNumber ?? null,
        isShort: body.isShort, status: body.status, workId,
        videoUrl: body.videoUrl || null, thumbnailUrl: body.thumbnailUrl || null,
        r2VideoKey: videoKey || null, r2ThumbnailKey: thumbnailKey || null,
        mediaReady: body.status === "READY", mediaCheckedAt: body.status === "READY" ? new Date() : null,
        seoTitle: body.seoTitle || null, seoDescription: body.seoDescription || null, seoKeywords: body.seoKeywords,
        publishedAt: old?.publishedAt ?? (body.status === "READY" ? new Date() : null),
      };
      const relations = {
        actresses: { ...(edit ? { deleteMany: {} } : {}), create: actressIds.map((actressId, sortOrder) => ({ actressId, sortOrder })) },
        tags: { ...(edit ? { deleteMany: {} } : {}), create: tags.map((tag) => ({ tagId: tag.id })) },
      };
      const item = edit
        ? await tx.video.update({ where: { id: body.id }, data: { ...data, ...relations }, include })
        : await tx.video.create({ data: { ...data, slug: newSlug!, ...relations }, include });
      if (body.sourcePageUrl) await tx.videoSource.upsert({
        where: { videoId_provider: { videoId: item.id, provider: body.sourceProvider || "manual" } },
        create: { videoId: item.id, provider: body.sourceProvider || "manual", sourcePageUrl: body.sourcePageUrl, sourceMediaUrl: body.sourceMediaUrl || null },
        update: { sourcePageUrl: body.sourcePageUrl, sourceMediaUrl: body.sourceMediaUrl || null },
      });
      if (old) await refreshCounts({ actressIds: old.actresses.map((a) => a.actressId), workId: old.workId, tagIds: old.tags.map((t) => t.tagId), year: old.year }, tx);
      await refreshCounts({ actressIds, workId, tagIds: tags.map((t) => t.id), year: body.year }, tx);
      return item;
    }, { maxWait: 10000, timeout: 30000 });
    invalidateCatalog({ slug: video.slug, isShort: video.isShort });
    await refreshProductionCatalog(request);
    return noStore(NextResponse.json({
      item: serializeVideo(video),
      publicPath: video.isShort ? `/shorts/${video.slug}` : `/watch/${video.slug}`,
      sitemapRefreshRequested: body.status === "READY",
    }, { status: edit ? 200 : 201 }));
  } catch (error) { return failure(error); }
}

export function POST(request: Request) { return save(request, false); }
export function PATCH(request: Request) { return save(request, true); }
