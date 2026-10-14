import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDb } from "./lib/db.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputPath = path.join(projectRoot, "src", "data", "public-catalog.snapshot.json");
const db = createDb();
const featuredTrendingCutoff = new Date("2026-09-12T06:16:17.142Z");
const featuredTrendingLastId = "vid_2dd82472bac683a0";
const featuredTrendingWhere = {
  isShort: false,
  OR: [
    { createdAt: { lt: featuredTrendingCutoff } },
    { createdAt: featuredTrendingCutoff, id: { lte: featuredTrendingLastId } },
  ],
};

const mediaBase = (process.env.NEXT_PUBLIC_MEDIA_URL || "/api/r2-media").replace(/\/+$/, "");

function mediaUrl(key) {
  if (!key) return "";
  if (/^https?:\/\//i.test(key) || key.startsWith("/api/")) return key;
  return `${mediaBase}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function profileImageUrl(row) {
  // A local fallback is deliberate: do not fabricate a per-actress R2 key or
  // reuse a video frame when a verified portrait is unavailable.
  if (!row.profileImage) return "/images/actress-placeholder.jpg";
  return mediaUrl(row.profileImage.replace(/^media\/actresses\//, "actresses/"));
}

function initialsFor(value) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function gradientFor(value) {
  const gradients = [
    ["#3b1d5a", "#c026d3"],
    ["#172554", "#2563eb"],
    ["#4c0519", "#e11d48"],
    ["#052e16", "#16a34a"],
    ["#431407", "#ea580c"],
    ["#312e81", "#7c3aed"],
    ["#083344", "#0891b2"],
  ];
  const score = [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const [from, to] = gradients[score % gradients.length];
  return `linear-gradient(135deg,${from},${to})`;
}

function publicActress(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    profileImageUrl: profileImageUrl(row),
    initials: initialsFor(row.name),
    color: gradientFor(row.slug),
    videoCount: row.videoCount ?? 0,
    biography: row.biography ?? null,
    seoTitle: row.seoTitle ?? null,
    seoDescription: row.seoDescription ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

function publicVideoActress(row) {
  const actress = publicActress(row);
  // A video card only needs identity and image data. Biography and SEO fields
  // are kept once in the top-level actress directory instead of being copied
  // into every linked video record.
  return {
    id: actress.id,
    name: actress.name,
    slug: actress.slug,
    profileImageUrl: actress.profileImageUrl,
    initials: actress.initials,
    color: actress.color,
    videoCount: actress.videoCount,
  };
}

function publicVideo(row) {
  const publishedAt = (row.publishedAt ?? row.createdAt ?? new Date()).toISOString();
  const updatedAt = (row.updatedAt ?? row.publishedAt ?? row.createdAt ?? new Date()).toISOString();
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || "Watch this Actrezz catalogue video and related actress, movie, TV series, tag and year pages.",
    durationSeconds: row.durationSeconds ?? 0,
    year: row.year,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    publishedAt,
    updatedAt,
    seoTitle: row.seoTitle ?? null,
    seoDescription: row.seoDescription ?? null,
    seoKeywords: Array.isArray(row.seoKeywords) ? row.seoKeywords.filter((item) => typeof item === "string") : [],
    videoUrl: mediaUrl(row.r2VideoKey || row.videoUrl || `videos/${row.id}.mp4`),
    thumbnailUrl: mediaUrl(row.r2ThumbnailKey || row.thumbnailUrl || `thumbnails/${row.id}.webp`),
    isShort: Boolean(row.isShort),
    viewCount: Number(row.viewCount ?? 0),
    work: row.work ? {
      id: row.work.id,
      title: row.work.title,
      slug: row.work.slug,
      type: row.work.type,
      // Work detail SEO is stored once in snapshot.works. The video relation
      // keeps only the fields required for cards, routing and video SEO.
      description: null,
      releaseYear: row.work.releaseYear ?? null,
      seoTitle: null,
      seoDescription: null,
      videoCount: 0,
      updatedAt,
    } : null,
    actresses: row.actresses.map((item) => publicVideoActress(item.actress)),
    tags: row.tags.map((item) => ({
      id: item.tag.id,
      name: item.tag.name,
      slug: item.tag.slug,
      videoCount: item.tag.videoCount ?? 0,
    })),
  };
}

try {
  const publicVideoWhere = { status: "READY", mediaReady: true };
  const [videos, featuredTrendingVideos, actresses, works, tags, years] = await Promise.all([
    db.video.findMany({
      where: publicVideoWhere,
      include: {
        work: {
          select: {
            id: true,
            title: true,
            slug: true,
            type: true,
            releaseYear: true,
            description: true,
            seoTitle: true,
            seoDescription: true,
            videoCount: true,
            updatedAt: true,
          },
        },
        actresses: {
          orderBy: { sortOrder: "asc" },
          include: {
            actress: {
              select: {
                id: true,
                name: true,
                slug: true,
                profileImage: true,
                videoCount: true,
                biography: true,
                seoTitle: true,
                seoDescription: true,
                updatedAt: true,
              },
            },
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                slug: true,
                videoCount: true,
                seoTitle: true,
                seoDescription: true,
              },
            },
          },
        },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    }),
    db.video.findMany({
      where: { AND: [publicVideoWhere, featuredTrendingWhere] },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.actress.findMany({
      where: { isPublished: true, videoCount: { gt: 0 } },
      select: {
        id: true,
        name: true,
        slug: true,
        profileImage: true,
        videoCount: true,
        biography: true,
        seoTitle: true,
        seoDescription: true,
        updatedAt: true,
      },
      orderBy: [{ sortName: "asc" }, { id: "asc" }],
    }),
    db.work.findMany({
      where: { isPublished: true, videoCount: { gt: 0 } },
      select: {
        id: true,
        title: true,
        slug: true,
        type: true,
        releaseYear: true,
        description: true,
        seoTitle: true,
        seoDescription: true,
        videoCount: true,
        updatedAt: true,
      },
      orderBy: [{ type: "asc" }, { sortTitle: "asc" }, { id: "asc" }],
    }),
    db.tag.findMany({
      where: { videoCount: { gt: 0 } },
      select: { id: true, name: true, slug: true, videoCount: true, seoTitle: true, seoDescription: true },
      orderBy: [{ videoCount: "desc" }, { name: "asc" }, { id: "asc" }],
    }),
    db.yearStat.findMany({
      where: { videoCount: { gt: 0 } },
      select: { year: true, videoCount: true, updatedAt: true },
      orderBy: { year: "desc" },
    }),
  ]);

  const snapshot = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    counts: {
      videos: videos.filter((video) => !video.isShort).length,
      shorts: videos.filter((video) => video.isShort).length,
      actresses: actresses.length,
      movies: works.filter((work) => work.type === "MOVIE").length,
      tvSeries: works.filter((work) => work.type === "TV_SHOW").length,
      tags: tags.length,
      years: years.length,
    },
    videos: videos.map(publicVideo),
    trendingFeaturedVideoIds: featuredTrendingVideos.map((video) => video.id),
    actresses: actresses.map(publicActress),
    works: works.map((work) => ({
      id: work.id,
      title: work.title,
      slug: work.slug,
      type: work.type,
      releaseYear: work.releaseYear ?? null,
      description: work.description ?? null,
      seoTitle: work.seoTitle ?? null,
      seoDescription: work.seoDescription ?? null,
      videoCount: work.videoCount ?? 0,
      updatedAt: work.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    })),
    tags,
    years: years.map((year) => ({
      year: year.year,
      videoCount: year.videoCount,
      updatedAt: year.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    })),
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`);
  console.log(`Public snapshot ready: ${snapshot.counts.videos} videos, ${snapshot.counts.actresses} actresses, ${snapshot.counts.movies + snapshot.counts.tvSeries} works, ${snapshot.counts.tags} tags.`);
} finally {
  await db.$disconnect();
}
