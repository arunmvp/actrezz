import "server-only";

import { notFound, permanentRedirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { PUBLIC_VIDEO_WHERE } from "@/lib/catalog-policy";
import { EXCLUDED_PUBLIC_TAG_SLUGS, isPublicTagSlug } from "@/lib/public-tag-policy";
import { SHORTIES_SEO_TAG_SLUGS, isShortiesSeoTagSlug } from "@/lib/shorties-tag-policy";

export type WorkType = "MOVIE" | "TV_SHOW";

export const PUBLIC_PAGE_SIZE = 24;
export const DIRECTORY_PAGE_SIZE = 48;
export const PUBLIC_REVALIDATE_SECONDS = 3600;

export type PublicActress = {
  id: string;
  name: string;
  slug: string;
  profileImageUrl: string;
  initials: string;
  color: string;
  videoCount: number;
  biography?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  updatedAt?: string;
};

export type PublicWork = {
  id: string;
  title: string;
  slug: string;
  type: WorkType;
  releaseYear: number | null;
  description: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  videoCount: number;
  updatedAt?: string;
};

export type PublicTag = { id: string; name: string; slug: string; videoCount: number; seoTitle?: string | null; seoDescription?: string | null };
export type PublicYear = { year: number; videoCount: number; updatedAt?: string };

export type PublicVideo = {
  id: string;
  slug: string;
  title: string;
  description: string;
  durationSeconds: number;
  year: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  publishedAt: string;
  updatedAt?: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  videoUrl: string;
  thumbnailUrl: string;
  isShort: boolean;
  viewCount: number;
  work: PublicWork | null;
  actresses: PublicActress[];
  tags: PublicTag[];
};

type PublicSnapshot = {
  schemaVersion: number;
  generatedAt: string;
  trendingFeaturedVideoIds?: string[];
  counts: {
    videos: number;
    shorts: number;
    actresses: number;
    movies: number;
    tvSeries: number;
    tags: number;
    years: number;
  };
  videos: PublicVideo[];
  actresses: PublicActress[];
  works: PublicWork[];
  tags: PublicTag[];
  years: PublicYear[];
};

// A complete catalogue snapshot used to be dynamically imported here. Even a
// dynamic JSON import is bundled into a Cloudflare Worker, and the 7k-video
// snapshot pushed the Worker past Cloudflare's 64 MiB validation limit. The
// production read path is PostgreSQL, so the failure fallback stays deliberately
// small: it keeps navigation responsive while the database is retried, instead
// of making a new release impossible to deploy.
const emptyFallbackCatalog: PublicSnapshot = {
  schemaVersion: 2,
  generatedAt: new Date(0).toISOString(),
  counts: { videos: 0, shorts: 0, actresses: 0, movies: 0, tvSeries: 0, tags: 0, years: 0 },
  videos: [],
  actresses: [],
  works: [],
  tags: [],
  years: [],
};

function loadFallbackCatalog(): Promise<PublicSnapshot> {
  return Promise.resolve(emptyFallbackCatalog);
}

// The static public catalogue is the normal production path. Do not load
// Prisma (and its Worker WASM runtime) merely because a public page imports
// this module; it can push an edge isolate into 1102 resource exhaustion.
// Database access remains available only for an explicitly enabled DB source.
type DatabaseClient = typeof import("@/lib/db").db;
let databasePromise: Promise<DatabaseClient> | undefined;

async function listDevelopmentShorties(page: number, pageSize: number) {
  if (process.env.NODE_ENV === "production") return null;
  const { listLocalShorties } = await import("@/lib/local-shorties-dev");
  return listLocalShorties(page, pageSize);
}

async function findDevelopmentShortiesFeed(slugOrId: string, limit: number) {
  if (process.env.NODE_ENV === "production") return null;
  const { findLocalShortiesFeed } = await import("@/lib/local-shorties-dev");
  return findLocalShortiesFeed(slugOrId, limit);
}

function loadDatabase(): Promise<DatabaseClient> {
  databasePromise ??= import("@/lib/db").then(({ db }) => db);
  return databasePromise;
}

const db = new Proxy({}, {
  get: (_target, model) => new Proxy({}, {
    get: (_delegate, operation) => async (...args: unknown[]) => {
      const client = await loadDatabase() as unknown as Record<string, Record<string, (...values: unknown[]) => unknown>>;
      return client[String(model)][String(operation)](...args);
    },
  }),
}) as unknown as DatabaseClient;

function mediaBase() {
  return (process.env.NEXT_PUBLIC_MEDIA_URL || "/api/r2-media").replace(/\/+$/, "");
}

function mediaUrl(key?: string | null) {
  if (!key) return "";
  if (/^https?:\/\//i.test(key) || key.startsWith("/api/")) return key;
  return `${mediaBase()}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function profileImageUrl(row: { profileImage?: string | null; slug: string }) {
  // One local, cacheable fallback prevents missing-object R2 requests. It is
  // deliberately not an actress-specific key: a missing portrait must never
  // be fabricated from a video frame.
  if (!row.profileImage) return "/images/actress-placeholder.jpg";
  const key = row.profileImage.replace(/^media\/actresses\//, "actresses/");
  return mediaUrl(key);
}

function initialsFor(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function gradientFor(value: string) {
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

function compactText(value?: string | null, max = 600) {
  return value ? value.replace(/\s+/g, " ").trim().slice(0, max) : null;
}

function publicActress(row: {
  id: string;
  name: string;
  slug: string;
  profileImage?: string | null;
  videoCount?: number | null;
  biography?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  updatedAt?: Date | string | null;
}): PublicActress {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    profileImageUrl: profileImageUrl(row),
    initials: initialsFor(row.name),
    color: gradientFor(row.slug),
    videoCount: row.videoCount ?? 0,
    biography: compactText(row.biography, 600),
    seoTitle: compactText(row.seoTitle, 95),
    seoDescription: compactText(row.seoDescription, 300),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt ?? undefined,
  };
}

type DbVideo = Awaited<ReturnType<typeof db.video.findMany>>[number] & {
  work: null | {
    id: string;
    title: string;
    slug: string;
    type: WorkType;
    releaseYear: number | null;
    description: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    videoCount: number;
    updatedAt: Date;
  };
  actresses: Array<{ actress: Parameters<typeof publicActress>[0] }>;
  tags: Array<{ tag: PublicTag }>;
};

function publicVideoFromDb(row: DbVideo): PublicVideo {
  const publishedAt = (row.publishedAt ?? row.createdAt ?? new Date()).toISOString();
  const updatedAt = (row.updatedAt ?? row.publishedAt ?? row.createdAt ?? new Date()).toISOString();
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: compactText(row.description, 800) || "Watch this Actrezz catalogue video and related actress, movie, TV series, tag and year pages.",
    durationSeconds: row.durationSeconds ?? 0,
    year: row.year,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    publishedAt,
    updatedAt,
    seoTitle: compactText(row.seoTitle, 95),
    seoDescription: compactText(row.seoDescription, 300),
    seoKeywords: Array.isArray(row.seoKeywords) ? row.seoKeywords.filter((item): item is string => typeof item === "string") : [],
    videoUrl: mediaUrl(row.r2VideoKey || row.videoUrl || `videos/${row.id}.mp4`),
    thumbnailUrl: mediaUrl(row.r2ThumbnailKey || row.thumbnailUrl || `thumbnails/${row.id}.webp`),
    isShort: Boolean(row.isShort),
    viewCount: Number(row.viewCount ?? 0),
    work: row.work ? {
      id: row.work.id,
      title: row.work.title,
      slug: row.work.slug,
      type: row.work.type,
      description: compactText(row.work.description, 500),
      releaseYear: row.work.releaseYear ?? null,
      seoTitle: compactText(row.work.seoTitle, 95),
      seoDescription: compactText(row.work.seoDescription, 300),
      videoCount: row.work.videoCount ?? 0,
      updatedAt: row.work.updatedAt.toISOString(),
    } : null,
    actresses: row.actresses.map((item) => publicActress(item.actress)),
    tags: row.tags.map((item) => ({
      id: item.tag.id,
      name: item.tag.name,
      slug: item.tag.slug,
      videoCount: item.tag.videoCount ?? 0,
      seoTitle: compactText(item.tag.seoTitle, 95),
      seoDescription: compactText(item.tag.seoDescription, 300),
    })),
  };
}

async function buildCatalogFromDb(): Promise<PublicSnapshot> {
  const [videos, actresses, works, tags, years] = await Promise.all([
    db.video.findMany({
      where: PUBLIC_VIDEO_WHERE,
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

  const publicVideos = videos.map((video) => publicVideoFromDb(video as DbVideo));
  const actressMap = new Map<string, PublicActress>();
  for (const actress of actresses) actressMap.set(actress.id, publicActress(actress));
  for (const video of publicVideos) for (const actress of video.actresses) actressMap.set(actress.id, actress);
  const workMap = new Map<string, PublicWork>();
  for (const work of works) {
    workMap.set(work.id, {
      id: work.id,
      title: work.title,
      slug: work.slug,
      type: work.type,
      releaseYear: work.releaseYear ?? null,
      description: compactText(work.description, 500),
      seoTitle: compactText(work.seoTitle, 95),
      seoDescription: compactText(work.seoDescription, 300),
      videoCount: work.videoCount ?? 0,
      updatedAt: work.updatedAt.toISOString(),
    });
  }
  for (const video of publicVideos) if (video.work) workMap.set(video.work.id, video.work);
  const tagMap = new Map<string, PublicTag>();
  for (const tag of tags) tagMap.set(tag.id, tag);
  for (const video of publicVideos) for (const tag of video.tags) tagMap.set(tag.id, tag);
  const yearMap = new Map<number, PublicYear>();
  for (const year of years) yearMap.set(year.year, { year: year.year, videoCount: year.videoCount, updatedAt: year.updatedAt.toISOString() });
  for (const video of publicVideos) if (video.year && !yearMap.has(video.year)) yearMap.set(video.year, { year: video.year, videoCount: 0, updatedAt: video.updatedAt });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    counts: {
      videos: publicVideos.filter((video) => !video.isShort).length,
      shorts: publicVideos.filter((video) => video.isShort).length,
      actresses: actressMap.size,
      movies: [...workMap.values()].filter((work) => work.type === "MOVIE").length,
      tvSeries: [...workMap.values()].filter((work) => work.type === "TV_SHOW").length,
      tags: tagMap.size,
      years: yearMap.size,
    },
    videos: publicVideos,
    actresses: [...actressMap.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    works: [...workMap.values()].sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
    tags: [...tagMap.values()].sort((a, b) => b.videoCount - a.videoCount || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    years: [...yearMap.values()].sort((a, b) => b.year - a.year),
  };
}

export async function getCatalog(): Promise<PublicSnapshot> {
  // The complete catalogue is larger than Next.js' 2 MB Data Cache item limit.
  // Normal public routes use bounded indexed queries; their failure fallback is
  // the generated in-memory snapshot, which is already bundled with the app.
  if (process.env.PUBLIC_CATALOG_FALLBACK_SOURCE !== "db") return loadFallbackCatalog();
  try {
    return await buildCatalogFromDb();
  } catch {
    return loadFallbackCatalog();
  }
}

function dateScore(value?: string | null) {
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

function normalizeSearch(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function paginate<T>(items: T[], page = 1, pageSize: number) {
  const currentPage = Math.max(1, page);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentPage > totalPages) notFound();
  return {
    items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    total,
    totalPages,
    page: currentPage,
  };
}

function sortVideos(items: PublicVideo[], sort: "latest" | "popular" = "latest") {
  return [...items].sort((a, b) => {
    if (sort === "popular") {
      const views = (b.viewCount || 0) - (a.viewCount || 0);
      if (views) return views;
      // Imported catalogues often start with every view counter at zero. Use
      // the stable id as the tie-breaker so Trending is not a duplicate of
      // Latest while still keeping pagination deterministic.
      return a.id.localeCompare(b.id);
    }
    return dateScore(b.publishedAt) - dateScore(a.publishedAt) || b.id.localeCompare(a.id);
  });
}

function sortFeaturedTrendingVideos(items: PublicVideo[], featuredIds: string[]) {
  const featuredRank = new Map(featuredIds.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aRank = featuredRank.get(a.id);
    const bRank = featuredRank.get(b.id);
    if (aRank !== undefined || bRank !== undefined) {
      if (aRank === undefined) return 1;
      if (bRank === undefined) return -1;
      return aRank - bRank;
    }
    const views = (b.viewCount || 0) - (a.viewCount || 0);
    return views || a.id.localeCompare(b.id);
  });
}

const publicVideoInclude = {
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
    orderBy: { sortOrder: "asc" as const },
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
} satisfies Prisma.VideoInclude;

// Listing cards never render long biographies, SEO copy, or work summaries.
// Selecting only the fields needed to paint a card keeps the initial home,
// directory, tag, and Shorts payloads small while detail/watch pages retain
// the full include above.
// Card surfaces never need the full video record. `include` would still select
// every Video scalar (including long descriptions and SEO fields) before it
// loads these relations. A narrow select keeps catalogues and related feeds
// small at the database, Worker and browser layers.
const publicVideoCardSelect = {
  id: true,
  slug: true,
  title: true,
  durationSeconds: true,
  year: true,
  seasonNumber: true,
  episodeNumber: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  r2VideoKey: true,
  videoUrl: true,
  r2ThumbnailKey: true,
  thumbnailUrl: true,
  isShort: true,
  viewCount: true,
  work: {
    select: {
      id: true,
      title: true,
      slug: true,
      type: true,
      releaseYear: true,
      videoCount: true,
      updatedAt: true,
    },
  },
  actresses: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      actress: {
        select: {
          id: true,
          name: true,
          slug: true,
          profileImage: true,
          videoCount: true,
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
        },
      },
    },
  },
} satisfies Prisma.VideoSelect;

function pageNumber(page?: number) {
  return Math.max(1, page ?? 1);
}

// The site's initial 600-video release is intentionally featured at the top
// of /trending in its original import order. The id makes the timestamp tie at
// the batch boundary deterministic, so this stays exactly 600 records.
const FEATURED_TRENDING_CUTOFF = new Date("2026-09-12T06:16:17.142Z");
const FEATURED_TRENDING_LAST_ID = "vid_2dd82472bac683a0";
const featuredTrendingSelector: Prisma.VideoWhereInput = {
  OR: [
    { createdAt: { lt: FEATURED_TRENDING_CUTOFF } },
    { createdAt: FEATURED_TRENDING_CUTOFF, id: { lte: FEATURED_TRENDING_LAST_ID } },
  ],
};

function pageResult<T>(items: T[], total: number, page?: number, pageSize = PUBLIC_PAGE_SIZE) {
  const currentPage = pageNumber(page);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentPage > totalPages) notFound();
  return { items, total, totalPages, page: currentPage };
}

// Directory totals (movies, TV series, actresses, tags) come from the single-row
// CatalogStats record instead of a per-request COUNT(*). Running COUNT over the
// large published Work/Actress sets on every page load pushed the Worker past
// the CPU budget and returned 503s on /movies and /tv-series. CatalogStats is
// refreshed by the import/publish jobs, so it is the authoritative total for the
// unfiltered directory listings. When a search query is present the result set
// is small, so a bounded count is safe.
async function directoryTotal(field: "movieCount" | "tvSeriesCount" | "actressCount" | "tagCount") {
  const stats = await db.catalogStats.findUnique({ where: { id: "primary" }, select: { [field]: true } });
  return stats?.[field] ?? 0;
}

function publicWork(row: {
  id: string;
  title: string;
  slug: string;
  type: WorkType;
  releaseYear: number | null;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  videoCount?: number | null;
  updatedAt?: Date | string | null;
}): PublicWork {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    type: row.type,
    releaseYear: row.releaseYear ?? null,
    description: compactText(row.description, 500),
    seoTitle: compactText(row.seoTitle, 95),
    seoDescription: compactText(row.seoDescription, 300),
    videoCount: row.videoCount ?? 0,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt ?? undefined,
  };
}

function publicTag(row: {
  id: string;
  name: string;
  slug: string;
  videoCount?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}): PublicTag {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    videoCount: row.videoCount ?? 0,
    seoTitle: compactText(row.seoTitle, 95),
    seoDescription: compactText(row.seoDescription, 300),
  };
}

export function publicVideo(row: PublicVideo) {
  return row;
}

function liveDbCatalogEnabled() {
  return process.env.PUBLIC_CATALOG_SOURCE === "db";
}

async function snapshotListPublicVideos(options: {
  page?: number;
  pageSize?: number;
  sort?: "latest" | "popular";
  trendingFeatured?: boolean;
  actressId?: string;
  workId?: string;
  tagId?: string;
  year?: number;
  isShort?: boolean;
} = {}) {
  const fallbackCatalog = await loadFallbackCatalog();
  const currentPage = pageNumber(options.page);
  const pageSize = Math.max(1, Math.min(48, Math.floor(options.pageSize ?? PUBLIC_PAGE_SIZE)));
  const isShort = options.isShort ?? false;
  if (isShort) {
    const local = await listDevelopmentShorties(currentPage, pageSize);
    if (local) return local;
  }
  const filtered = fallbackCatalog.videos.filter((video) => (
    video.isShort === isShort &&
    (!options.actressId || video.actresses.some((actress) => actress.id === options.actressId)) &&
    (!options.workId || video.work?.id === options.workId) &&
    (!options.tagId || video.tags.some((tag) => tag.id === options.tagId)) &&
    (!options.year || video.year === options.year)
  ));
  const useFeaturedTrending = options.trendingFeatured === true && options.sort === "popular" && !isShort &&
    !options.actressId && !options.workId && !options.tagId && !options.year;
  const sorted = useFeaturedTrending
    ? sortFeaturedTrendingVideos(filtered, fallbackCatalog.trendingFeaturedVideoIds ?? [])
    : sortVideos(filtered, options.sort);
  return paginate(sorted, currentPage, pageSize);
}

async function snapshotSearchPublicVideos(query: string, page = 1) {
  const fallbackCatalog = await loadFallbackCatalog();
  const currentPage = pageNumber(page);
  const clean = query.trim().replace(/\s+/g, " ").slice(0, 100);
  const stopWords = new Set(["video", "videos", "scene", "scenes", "movie", "movies", "series", "watch"]);
  const terms = clean.toLowerCase().split(/\s+/).map((term) => term.replace(/[^a-z0-9-]/g, "")).filter((term) => term.length > 1 && !stopWords.has(term)).slice(0, 6);
  if (!terms.length) return { items: [] as PublicVideo[], total: 0, totalPages: 1, page: currentPage };
  const filtered = fallbackCatalog.videos.filter((video) => {
    if (video.isShort) return false;
    const haystack = normalizeSearch([
      video.title,
      video.description,
      video.work?.title,
      ...video.actresses.map((actress) => actress.name),
      ...video.tags.map((tag) => tag.name),
    ].filter(Boolean).join(" "));
    return terms.every((term) => haystack.includes(term));
  });
  return paginate(sortVideos(filtered), currentPage, PUBLIC_PAGE_SIZE);
}

async function snapshotFindPublicVideo(slugOrId: string, options: { includeShorts?: boolean } = {}) {
  const fallbackCatalog = await loadFallbackCatalog();
  return fallbackCatalog.videos.find((video) => (
    (video.slug === slugOrId || video.id === slugOrId) &&
    (options.includeShorts || !video.isShort)
  )) ?? null;
}

async function snapshotFindActress(slugOrId: string) {
  const fallbackCatalog = await loadFallbackCatalog();
  return fallbackCatalog.actresses.find((item) => item.slug === slugOrId || item.id === slugOrId) ?? null;
}

async function snapshotListActresses(page = 1, query = "") {
  const fallbackCatalog = await loadFallbackCatalog();
  const clean = normalizeSearch(query.trim().slice(0, 80));
  const rows = clean ? fallbackCatalog.actresses.filter((item) => normalizeSearch(item.name).includes(clean)) : fallbackCatalog.actresses;
  return paginate(rows, pageNumber(page), DIRECTORY_PAGE_SIZE);
}

async function snapshotListWorks(type: WorkType, page = 1, query = "") {
  const fallbackCatalog = await loadFallbackCatalog();
  const clean = normalizeSearch(query.trim().slice(0, 80));
  const rows = fallbackCatalog.works.filter((item) => item.type === type && (!clean || normalizeSearch(item.title).includes(clean)));
  return paginate(rows, pageNumber(page), DIRECTORY_PAGE_SIZE);
}

async function snapshotListTags(page = 1, query = "") {
  const fallbackCatalog = await loadFallbackCatalog();
  const clean = normalizeSearch(query.trim().slice(0, 80));
  const rows = fallbackCatalog.tags.filter((item) => isPublicTagSlug(item.slug) && item.videoCount > 1 && (!clean || normalizeSearch(item.name).includes(clean)));
  return paginate(rows, pageNumber(page), DIRECTORY_PAGE_SIZE);
}

async function snapshotSitemapData() {
  const catalog = await loadFallbackCatalog();
  return {
    generatedAt: catalog.generatedAt,
    counts: catalog.counts,
    videos: catalog.videos.map((video) => ({ slug: video.slug, isShort: video.isShort, updatedAt: video.updatedAt })),
    actresses: catalog.actresses.map((actress) => ({ slug: actress.slug, videoCount: actress.videoCount, updatedAt: actress.updatedAt })),
    movies: catalog.works.filter((work) => work.type === "MOVIE").map((work) => ({ slug: work.slug, videoCount: work.videoCount, updatedAt: work.updatedAt })),
    tvSeries: catalog.works.filter((work) => work.type === "TV_SHOW").map((work) => ({ slug: work.slug, videoCount: work.videoCount, updatedAt: work.updatedAt })),
    tags: catalog.tags.filter((tag) => isPublicTagSlug(tag.slug) && tag.videoCount > 1).map((tag) => ({ slug: tag.slug, videoCount: tag.videoCount })),
    years: catalog.years.map((year) => ({ year: year.year, videoCount: year.videoCount, updatedAt: year.updatedAt })),
  };
}

async function listPublicVideosUncached(options: {
  page?: number;
  pageSize?: number;
  sort?: "latest" | "popular";
  trendingFeatured?: boolean;
  actressId?: string;
  workId?: string;
  tagId?: string;
  year?: number;
  isShort?: boolean;
  includeShorts?: boolean;
} = {}) {
  if (!liveDbCatalogEnabled() && !options.isShort && !options.includeShorts) return await snapshotListPublicVideos(options);
  const currentPage = pageNumber(options.page);
  const pageSize = Math.max(1, Math.min(48, Math.floor(options.pageSize ?? PUBLIC_PAGE_SIZE)));
  const isShort = options.includeShorts ? undefined : (options.isShort ?? false);
  if (isShort) {
    const local = await listDevelopmentShorties(currentPage, pageSize);
    if (local) return local;
  }
  const where: Prisma.VideoWhereInput = {
    ...PUBLIC_VIDEO_WHERE,
    ...(typeof isShort === "boolean" ? { isShort } : {}),
    ...(options.actressId ? { actresses: { some: { actressId: options.actressId } } } : {}),
    ...(options.workId ? { workId: options.workId } : {}),
    ...(options.tagId ? { tags: { some: { tagId: options.tagId } } } : {}),
    ...(options.year ? { year: options.year } : {}),
  };
  try {
    const orderBy: Prisma.VideoOrderByWithRelationInput[] = options.sort === "popular"
      ? [{ viewCount: "desc" }, { id: "asc" }]
      : [{ publishedAt: "desc" }, { id: "desc" }];
    const skip = (currentPage - 1) * pageSize;

    // This is deliberately opt-in for the public Trending page only. Search,
    // actress, movie, and home listings retain their existing orders.
    const useFeaturedTrending = options.trendingFeatured === true && options.sort === "popular" && isShort === false &&
      !options.actressId && !options.workId && !options.tagId && !options.year;
    if (useFeaturedTrending) {
      const featuredWhere: Prisma.VideoWhereInput = { AND: [where, featuredTrendingSelector] };
      const standardWhere: Prisma.VideoWhereInput = { AND: [where, { NOT: featuredTrendingSelector }] };
      const [featuredTotal, total] = await Promise.all([
        db.video.count({ where: featuredWhere }),
        db.video.count({ where }),
      ]);
      const featuredOrder: Prisma.VideoOrderByWithRelationInput[] = [{ createdAt: "asc" }, { id: "asc" }];
      const rows = skip < featuredTotal
        ? await db.video.findMany({
          where: featuredWhere,
          orderBy: featuredOrder,
          skip,
          take: Math.min(pageSize, featuredTotal - skip),
          select: publicVideoCardSelect,
        })
        : await db.video.findMany({
          where: standardWhere,
          orderBy,
          skip: skip - featuredTotal,
          take: pageSize,
          select: publicVideoCardSelect,
        });
      return pageResult(rows.map((row) => publicVideoFromDb(row as unknown as DbVideo)), total, currentPage, pageSize);
    }

    // Shorts pages are normally small and are latency-sensitive. Fetch one
    // extra row first; when this is the final page, its total is known without
    // a second PostgreSQL round trip. A count query is only needed once the
    // catalogue grows beyond the current page.
    if (isShort) {
      const rows = await db.video.findMany({
        where,
        orderBy,
        skip,
        take: pageSize + 1,
        select: publicVideoCardSelect,
      });
      const hasMore = rows.length > pageSize;
      const pageRows = rows.slice(0, pageSize);
      const total = hasMore ? await db.video.count({ where }) : skip + pageRows.length;
      return pageResult(pageRows.map((row) => publicVideoFromDb(row as unknown as DbVideo)), total, currentPage, pageSize);
    }

    const [rows, total] = await Promise.all([
      db.video.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: publicVideoCardSelect,
      }),
      db.video.count({ where }),
    ]);
    return pageResult(rows.map((row) => publicVideoFromDb(row as unknown as DbVideo)), total, currentPage, pageSize);
  } catch {
    const catalog = await getCatalog();
    const filtered = catalog.videos.filter((video) => (
      (typeof isShort !== "boolean" || video.isShort === isShort) &&
      (!options.actressId || video.actresses.some((actress) => actress.id === options.actressId)) &&
      (!options.workId || video.work?.id === options.workId) &&
      (!options.tagId || video.tags.some((tag) => tag.id === options.tagId)) &&
      (!options.year || video.year === options.year)
    ));
    return paginate(sortVideos(filtered, options.sort), currentPage, pageSize);
  }
}

type PublicVideoPage = Awaited<ReturnType<typeof listPublicVideosUncached>>;
const publicVideoPageCache = new Map<string, { expiresAt: number; value: PublicVideoPage }>();
const publicVideoPageInflight = new Map<string, Promise<PublicVideoPage>>();
const PUBLIC_PAGE_MEMORY_TTL = 30_000;

export async function listPublicVideos(options: Parameters<typeof listPublicVideosUncached>[0] = {}) {
  // The Worker cache is regional; a tiny in-isolate cache also deduplicates
  // the home page's parallel requests and repeated Load more clicks. It is
  // intentionally short-lived so a newly published batch appears quickly.
  if (!liveDbCatalogEnabled() || process.env.NODE_ENV !== "production") {
    return listPublicVideosUncached(options);
  }
  const key = JSON.stringify({
    page: options.page ?? 1,
    pageSize: options.pageSize ?? PUBLIC_PAGE_SIZE,
    sort: options.sort ?? "latest",
    trendingFeatured: options.trendingFeatured ?? false,
    actressId: options.actressId ?? null,
    workId: options.workId ?? null,
    tagId: options.tagId ?? null,
    year: options.year ?? null,
    isShort: options.isShort ?? null,
    includeShorts: options.includeShorts ?? false,
  });
  const now = Date.now();
  const cached = publicVideoPageCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const running = publicVideoPageInflight.get(key);
  if (running) return running;
  const request = listPublicVideosUncached(options).then((value) => {
    // Do not cache an empty fallback page after a transient DB/network error;
    // the next request should be able to recover immediately.
    if (value.items.length > 0 || value.total > 0) {
      publicVideoPageCache.set(key, { expiresAt: Date.now() + PUBLIC_PAGE_MEMORY_TTL, value });
      if (publicVideoPageCache.size > 40) {
        const oldest = publicVideoPageCache.keys().next().value;
        if (oldest) publicVideoPageCache.delete(oldest);
      }
    }
    return value;
  }).finally(() => publicVideoPageInflight.delete(key));
  publicVideoPageInflight.set(key, request);
  return request;
}

const cachedPublicShorts = unstable_cache(
  (page = 1) => listPublicVideos({ page, isShort: true }),
  ["public-shorts-page"],
  { revalidate: 300, tags: ["catalog"] },
);

export async function listPublicShorts(page = 1) {
  // Development stress data is intentionally outside the shared cache: it is
  // local-machine state and must never poison the five-minute public result.
  const local = await listDevelopmentShorties(pageNumber(page), PUBLIC_PAGE_SIZE);
  return local ?? cachedPublicShorts(page);
}

export async function searchPublicVideos(query: string, page = 1) {
  if (!liveDbCatalogEnabled()) return await snapshotSearchPublicVideos(query, page);
  const currentPage = pageNumber(page);
  const clean = query.trim().replace(/\s+/g, " ").slice(0, 100);
  const stopWords = new Set(["video", "videos", "scene", "scenes", "movie", "movies", "series", "watch"]);
  const terms = clean.toLowerCase().split(/\s+/).map((term) => term.replace(/[^a-z0-9-]/g, "")).filter((term) => term.length > 1 && !stopWords.has(term)).slice(0, 6);
  if (!terms.length) return { items: [] as PublicVideo[], total: 0, totalPages: 1, page: currentPage };
  const termFilters: Prisma.VideoWhereInput[] = terms.map((term) => ({
    OR: [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { seoTitle: { contains: term, mode: "insensitive" } },
      { seoDescription: { contains: term, mode: "insensitive" } },
      { work: { is: { title: { contains: term, mode: "insensitive" } } } },
      { actresses: { some: { actress: { name: { contains: term, mode: "insensitive" } } } } },
      { tags: { some: { tag: { name: { contains: term, mode: "insensitive" } } } } },
    ],
  }));
  const where: Prisma.VideoWhereInput = { ...PUBLIC_VIDEO_WHERE, isShort: false, AND: termFilters };
  try {
    const [rows, total] = await Promise.all([
      db.video.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip: (currentPage - 1) * PUBLIC_PAGE_SIZE,
        take: PUBLIC_PAGE_SIZE,
        include: publicVideoInclude,
      }),
      db.video.count({ where }),
    ]);
    return pageResult(rows.map((row) => publicVideoFromDb(row as unknown as DbVideo)), total, currentPage);
  } catch {
    const catalog = await getCatalog();
    const filtered = catalog.videos.filter((video) => {
      if (video.isShort) return false;
      const haystack = normalizeSearch([
        video.title,
        video.description,
        video.work?.title,
        ...video.actresses.map((actress) => actress.name),
        ...video.tags.map((tag) => tag.name),
      ].filter(Boolean).join(" "));
      return terms.every((term) => haystack.includes(term));
    });
    return paginate(sortVideos(filtered), currentPage, PUBLIC_PAGE_SIZE);
  }
}

async function findPublicVideoUncached(slugOrId: string, options: { includeShorts?: boolean } = {}) {
  if (!liveDbCatalogEnabled()) {
    const video = await snapshotFindPublicVideo(slugOrId, options);
    if (video || !options.includeShorts) return video;
  }
  try {
    const row = await db.video.findFirst({
      where: {
        ...PUBLIC_VIDEO_WHERE,
        ...(options.includeShorts ? {} : { isShort: false }),
        OR: [{ slug: slugOrId }, { id: slugOrId }],
      },
      include: publicVideoInclude,
    });
    return row ? publicVideoFromDb(row as unknown as DbVideo) : null;
  } catch {
    const catalog = await getCatalog();
    return catalog.videos.find((video) => (
      (video.slug === slugOrId || video.id === slugOrId) &&
      (options.includeShorts || !video.isShort)
    )) ?? null;
  }
}

const publicVideoDetailCache = new Map<string, { expiresAt: number; value: PublicVideo }>();
const publicVideoDetailInflight = new Map<string, Promise<PublicVideo | null>>();
const PUBLIC_DETAIL_MEMORY_TTL = 60_000;

export async function findPublicVideo(slugOrId: string, options: { includeShorts?: boolean } = {}) {
  if (!liveDbCatalogEnabled() || process.env.NODE_ENV !== "production") {
    return findPublicVideoUncached(slugOrId, options);
  }
  const key = `${options.includeShorts ? "all" : "long"}:${slugOrId}`;
  const now = Date.now();
  const cached = publicVideoDetailCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const running = publicVideoDetailInflight.get(key);
  if (running) return running;
  const request = findPublicVideoUncached(slugOrId, options).then((video) => {
    // A missing record must not be cached; a publish can make it available at
    // any moment and should not have to wait for this small performance TTL.
    if (video) {
      publicVideoDetailCache.set(key, { expiresAt: Date.now() + PUBLIC_DETAIL_MEMORY_TTL, value: video });
      if (publicVideoDetailCache.size > 160) {
        const oldest = publicVideoDetailCache.keys().next().value;
        if (oldest) publicVideoDetailCache.delete(oldest);
      }
    }
    return video;
  }).finally(() => publicVideoDetailInflight.delete(key));
  publicVideoDetailInflight.set(key, request);
  return request;
}

export async function requirePublicVideo(slugOrId: string) {
  const video = await findPublicVideo(slugOrId);
  if (!video) notFound();
  if (slugOrId === video.id) permanentRedirect(`/watch/${video.slug}`);
  return video;
}

export async function getShortPlayerFeed(slugOrId: string, limit = 15) {
  // The player only attaches media sources to the active slide and its two
  // neighbours. Keep the initial server payload deliberately short: sending
  // sixty full catalogue records delayed the first Reel despite the browser
  // downloading only three media files. The client appends further pages as
  // the visitor swipes, so this does not cap the feed.
  const safeLimit = Math.min(15, Math.max(3, limit));
  const local = await findDevelopmentShortiesFeed(slugOrId, safeLimit);
  if (local) return local;

  if (!liveDbCatalogEnabled()) {
    const catalog = await loadFallbackCatalog();
    const shorts = sortVideos(catalog.videos.filter((video) => video.isShort));
    const targetIndex = shorts.findIndex((video) => video.slug === slugOrId || video.id === slugOrId);
    if (targetIndex >= 0) {
      const target = shorts[targetIndex];
      const older = shorts.slice(targetIndex + 1, targetIndex + safeLimit);
      const newer = shorts.slice(Math.max(0, targetIndex - safeLimit), targetIndex).reverse();
      // Put the requested Short in the first slide. Initialising a native
      // scroll-snap feed at a later index visibly scrolls through unrelated
      // Shorts before landing on the link the visitor clicked.
      return { video: target, items: [target, ...older, ...newer].slice(0, safeLimit), initialIndex: 0 };
    }
    // The generated snapshot is intentionally static so the main catalogue
    // never loads Prisma on an edge request. Fresh Shorts are saved directly
    // through the admin API, though, and are visible in the live Shorts list
    // before the next site build. Fall through to the narrow DB lookup below
    // when a new Short is absent from that snapshot; otherwise its card links
    // to a cached 404 until the next deployment.
  }

  try {
    const target = await db.video.findFirst({
      where: {
        ...PUBLIC_VIDEO_WHERE,
        isShort: true,
        OR: [{ slug: slugOrId }, { id: slugOrId }],
      },
      select: publicVideoCardSelect,
    });
    if (!target) return null;
    const publishedAt = target.publishedAt ?? target.createdAt;
    const [nearerNewer, older] = await Promise.all([
      db.video.findMany({
        where: {
          ...PUBLIC_VIDEO_WHERE,
          isShort: true,
          OR: [
            { publishedAt: { gt: publishedAt } },
            { publishedAt, id: { gt: target.id } },
          ],
        },
        orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
        take: safeLimit,
        select: publicVideoCardSelect,
      }),
      db.video.findMany({
        where: {
          ...PUBLIC_VIDEO_WHERE,
          isShort: true,
          OR: [
            { publishedAt: { lt: publishedAt } },
            { publishedAt, id: { lt: target.id } },
          ],
        },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: safeLimit,
        select: publicVideoCardSelect,
      }),
    ]);
    const newer = nearerNewer.reverse();
    const items = [target, ...older, ...newer].slice(0, safeLimit).map((row) => publicVideoFromDb(row as unknown as DbVideo));
    return {
      video: publicVideoFromDb(target as unknown as DbVideo),
      items,
      initialIndex: 0,
    };
  } catch {
    const catalog = await getCatalog();
    const shorts = sortVideos(catalog.videos.filter((video) => video.isShort));
    const targetIndex = shorts.findIndex((video) => video.slug === slugOrId || video.id === slugOrId);
    if (targetIndex < 0) return null;
    const target = shorts[targetIndex];
    const older = shorts.slice(targetIndex + 1, targetIndex + safeLimit);
    const newer = shorts.slice(Math.max(0, targetIndex - safeLimit), targetIndex).reverse();
    return { video: target, items: [target, ...older, ...newer].slice(0, safeLimit), initialIndex: 0 };
  }
}

export async function findActress(slugOrId: string) {
  if (!liveDbCatalogEnabled()) {
    const actress = await snapshotFindActress(slugOrId);
    if (actress) return actress;
  }
  try {
    const row = await db.actress.findFirst({
      where: { isPublished: true, OR: [{ slug: slugOrId }, { id: slugOrId }] },
      select: { id: true, name: true, slug: true, profileImage: true, videoCount: true, biography: true, seoTitle: true, seoDescription: true, updatedAt: true },
    });
    return row ? publicActress(row) : null;
  } catch {
    const catalog = await getCatalog();
    const actressesBySlugOrId = new Map(catalog.actresses.flatMap((item) => [[item.slug, item], [item.id, item]]));
    return actressesBySlugOrId.get(slugOrId) ?? null;
  }
}

export async function requireActress(slugOrId: string) {
  const actress = await findActress(slugOrId);
  if (!actress) notFound();
  if (slugOrId === actress.id) permanentRedirect(`/actress/${actress.slug}`);
  return actress;
}

export async function listActresses(page = 1, query = "") {
  if (!liveDbCatalogEnabled()) return await snapshotListActresses(page, query);
  const currentPage = pageNumber(page);
  const q = query.trim().slice(0, 80);
  const where: Prisma.ActressWhereInput = {
    isPublished: true,
    videoCount: { gt: 0 },
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  try {
    const [rows, total] = await Promise.all([
      db.actress.findMany({
        where,
        select: { id: true, name: true, slug: true, profileImage: true, videoCount: true, biography: true, seoTitle: true, seoDescription: true, updatedAt: true },
        orderBy: [{ sortName: "asc" }, { id: "asc" }],
        skip: (currentPage - 1) * DIRECTORY_PAGE_SIZE,
        take: DIRECTORY_PAGE_SIZE,
      }),
      q ? db.actress.count({ where }) : directoryTotal("actressCount"),
    ]);
    return pageResult(rows.map(publicActress), total, currentPage, DIRECTORY_PAGE_SIZE);
  } catch {
    const catalog = await getCatalog();
    const clean = normalizeSearch(q);
    const rows = clean ? catalog.actresses.filter((item) => normalizeSearch(item.name).includes(clean)) : catalog.actresses;
    return paginate(rows, currentPage, DIRECTORY_PAGE_SIZE);
  }
}

export async function listWorks(type: WorkType, page = 1, query = "") {
  if (!liveDbCatalogEnabled()) return await snapshotListWorks(type, page, query);
  const currentPage = pageNumber(page);
  const q = query.trim().slice(0, 80);
  const where: Prisma.WorkWhereInput = {
    isPublished: true,
    videoCount: { gt: 0 },
    type,
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
  };
  try {
    const [rows, total] = await Promise.all([
      db.work.findMany({
        where,
        select: { id: true, title: true, slug: true, type: true, releaseYear: true, description: true, seoTitle: true, seoDescription: true, videoCount: true, updatedAt: true },
        orderBy: [{ sortTitle: "asc" }, { id: "asc" }],
        skip: (currentPage - 1) * DIRECTORY_PAGE_SIZE,
        take: DIRECTORY_PAGE_SIZE,
      }),
      q ? db.work.count({ where }) : directoryTotal(type === "MOVIE" ? "movieCount" : "tvSeriesCount"),
    ]);
    return pageResult(rows.map(publicWork), total, currentPage, DIRECTORY_PAGE_SIZE);
  } catch {
    const catalog = await getCatalog();
    const clean = normalizeSearch(q);
    const rows = catalog.works.filter((item) => item.type === type && (!clean || normalizeSearch(item.title).includes(clean)));
    return paginate(rows, currentPage, DIRECTORY_PAGE_SIZE);
  }
}

export async function listTags(page = 1, query = "") {
  if (!liveDbCatalogEnabled()) return await snapshotListTags(page, query);
  const currentPage = pageNumber(page);
  const q = query.trim().slice(0, 80);
  const where: Prisma.TagWhereInput = {
    videoCount: { gt: 1 },
    slug: { notIn: EXCLUDED_PUBLIC_TAG_SLUGS },
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  try {
    const [rows, total] = await Promise.all([
      db.tag.findMany({
        where,
        select: { id: true, name: true, slug: true, videoCount: true, seoTitle: true, seoDescription: true },
        orderBy: [{ videoCount: "desc" }, { name: "asc" }, { id: "asc" }],
        skip: (currentPage - 1) * DIRECTORY_PAGE_SIZE,
        take: DIRECTORY_PAGE_SIZE,
      }),
      db.tag.count({ where }),
    ]);
    return pageResult(rows.map(publicTag), total, currentPage, DIRECTORY_PAGE_SIZE);
  } catch {
    const catalog = await getCatalog();
    const clean = normalizeSearch(q);
    const rows = catalog.tags.filter((item) => isPublicTagSlug(item.slug) && item.videoCount > 1 && (!clean || normalizeSearch(item.name).includes(clean)));
    return paginate(rows, currentPage, DIRECTORY_PAGE_SIZE);
  }
}

export async function listYears(page = 1) {
  if (!liveDbCatalogEnabled()) {
    const catalog = await loadFallbackCatalog();
    return paginate(catalog.years, pageNumber(page), DIRECTORY_PAGE_SIZE);
  }
  const currentPage = pageNumber(page);
  try {
    const [rows, total] = await Promise.all([
      db.yearStat.findMany({
        where: { videoCount: { gt: 0 } },
        select: { year: true, videoCount: true, updatedAt: true },
        orderBy: { year: "desc" },
        skip: (currentPage - 1) * DIRECTORY_PAGE_SIZE,
        take: DIRECTORY_PAGE_SIZE,
      }),
      db.yearStat.count({ where: { videoCount: { gt: 0 } } }),
    ]);
    return pageResult(rows.map((row) => ({ year: row.year, videoCount: row.videoCount, updatedAt: row.updatedAt.toISOString() })), total, currentPage, DIRECTORY_PAGE_SIZE);
  } catch {
    const catalog = await getCatalog();
    return paginate(catalog.years, currentPage, DIRECTORY_PAGE_SIZE);
  }
}

export async function findWork(type: WorkType, slug: string) {
  if (!liveDbCatalogEnabled()) {
    const catalog = await loadFallbackCatalog();
    return catalog.works.find((item) => item.type === type && item.slug === slug) ?? null;
  }
  try {
    const row = await db.work.findFirst({
      where: { type, slug, isPublished: true },
      select: { id: true, title: true, slug: true, type: true, releaseYear: true, description: true, seoTitle: true, seoDescription: true, videoCount: true, updatedAt: true },
    });
    return row ? publicWork(row) : null;
  } catch {
    const catalog = await getCatalog();
    const worksByTypeAndSlug = new Map(catalog.works.map((item) => [`${item.type}:${item.slug}`, item]));
    return worksByTypeAndSlug.get(`${type}:${slug}`) ?? null;
  }
}

export async function findTag(slug: string) {
  if (!liveDbCatalogEnabled()) {
    const catalog = await loadFallbackCatalog();
    return catalog.tags.find((item) => item.slug === slug && item.videoCount > 0 && isPublicTagSlug(item.slug)) ?? null;
  }
  try {
    const row = await db.tag.findFirst({
      where: { slug, videoCount: { gt: 0 } },
      select: { id: true, name: true, slug: true, videoCount: true, seoTitle: true, seoDescription: true },
    });
    return row && isPublicTagSlug(row.slug) ? publicTag(row) : null;
  } catch {
    const catalog = await getCatalog();
    const tagsBySlug = new Map(catalog.tags.map((item) => [item.slug, item]));
    const tag = tagsBySlug.get(slug);
    return tag && isPublicTagSlug(tag.slug) ? tag : null;
  }
}

export async function findYear(year: number) {
  if (!liveDbCatalogEnabled()) {
    const catalog = await loadFallbackCatalog();
    return catalog.years.find((item) => item.year === year) ?? null;
  }
  try {
    const row = await db.yearStat.findFirst({ where: { year, videoCount: { gt: 0 } }, select: { year: true, videoCount: true, updatedAt: true } });
    return row ? { year: row.year, videoCount: row.videoCount, updatedAt: row.updatedAt.toISOString() } : null;
  } catch {
    const catalog = await getCatalog();
    const yearsByYear = new Map(catalog.years.map((item) => [item.year, item]));
    return yearsByYear.get(year) ?? null;
  }
}

type RelatedVideoContext = {
  id: string;
  isShort: boolean;
  workId: string | null;
  year: number | null;
  actressIds: string[];
  tagIds: string[];
};

function relatedContextFromVideo(video: PublicVideo): RelatedVideoContext {
  return {
    id: video.id,
    isShort: video.isShort,
    workId: video.work?.id ?? null,
    year: video.year,
    actressIds: video.actresses.map((actress) => actress.id).sort(),
    tagIds: video.tags.map((tag) => tag.id).sort(),
  };
}

async function findRelatedVideoContextUncached(slug: string): Promise<RelatedVideoContext | null> {
  if (!liveDbCatalogEnabled()) {
    const video = await findPublicVideo(slug);
    return video ? relatedContextFromVideo(video) : null;
  }
  try {
    // The related endpoint only needs relation IDs to build its feed. Loading
    // a whole watch record here duplicated the page's detailed video query.
    const row = await db.video.findFirst({
      where: { ...PUBLIC_VIDEO_WHERE, isShort: false, slug },
      select: {
        id: true,
        isShort: true,
        workId: true,
        year: true,
        actresses: { select: { actressId: true } },
        tags: { select: { tagId: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      isShort: row.isShort,
      workId: row.workId,
      year: row.year,
      actressIds: row.actresses.map((item) => item.actressId).sort(),
      tagIds: row.tags.map((item) => item.tagId).sort(),
    };
  } catch {
    return null;
  }
}

const cachedRelatedVideoContext = unstable_cache(
  (slug: string) => findRelatedVideoContextUncached(slug),
  ["public-related-context-v1"],
  { revalidate: 300, tags: ["catalog"] },
);

async function findRelatedVideoContext(slug: string) {
  // Keep local development immediately responsive to edits; production uses
  // the shared cache so a popular watch page does not reopen its DB lookup.
  return process.env.NODE_ENV === "production"
    ? cachedRelatedVideoContext(slug)
    : findRelatedVideoContextUncached(slug);
}

async function buildRelatedCandidateSet(video: RelatedVideoContext) {
  const relatedCandidateLimit = 144;
  const actressIds = video.actressIds;
  const tagIds = video.tagIds;
  if (!liveDbCatalogEnabled() && !video.isShort) {
    const catalog = await loadFallbackCatalog();
    const actressSet = new Set(actressIds);
    const tagSet = new Set(tagIds);
    return catalog.videos
      .filter((item) => item.id !== video.id && item.isShort === video.isShort)
      .map((item) => {
        const actressScore = item.actresses.some((actress) => actressSet.has(actress.id)) ? 16 : 0;
        const workScore = item.work?.id && item.work.id === video.workId ? 12 : 0;
        const tagScore = item.tags.filter((tag) => tagSet.has(tag.id)).length * 4;
        const yearScore = item.year && item.year === video.year ? 1 : 0;
        return { item, score: actressScore + workScore + tagScore + yearScore };
      })
      .sort((a, b) => b.score - a.score || dateScore(b.item.publishedAt) - dateScore(a.item.publishedAt))
      .slice(0, relatedCandidateLimit)
      .map((row) => row.item);
  }

  const criteria: Prisma.VideoWhereInput[] = [
    ...(video.workId ? [{ workId: video.workId }] : []),
    ...(video.year ? [{ year: video.year }] : []),
    ...(actressIds.length ? [{ actresses: { some: { actressId: { in: actressIds } } } }] : []),
    ...(tagIds.length ? [{ tags: { some: { tagId: { in: tagIds } } } }] : []),
  ];
  try {
    const rows = await db.video.findMany({
      where: {
        ...PUBLIC_VIDEO_WHERE,
        isShort: video.isShort,
        id: { not: video.id },
        ...(criteria.length ? { OR: criteria } : {}),
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: relatedCandidateLimit,
      select: publicVideoCardSelect,
    });
    const scored = rows.map((row) => {
      const item = publicVideoFromDb(row as unknown as DbVideo);
      const actressScore = item.actresses.some((actress) => actressIds.includes(actress.id)) ? 16 : 0;
      const workScore = item.work?.id && item.work.id === video.workId ? 12 : 0;
      const tagScore = item.tags.filter((tag) => tagIds.includes(tag.id)).length * 4;
      const yearScore = item.year && item.year === video.year ? 1 : 0;
      return { item, score: actressScore + workScore + tagScore + yearScore };
    }).sort((a, b) => b.score - a.score || dateScore(b.item.publishedAt) - dateScore(a.item.publishedAt));
    const related = scored.map((row) => row.item);
    if (related.length >= relatedCandidateLimit) return related;

    // Build a stable full candidate set once. Later offsets slice this same
    // array, so Load more cannot repeat an earlier card when ranks change.
    const existing = new Set([video.id, ...related.map((item) => item.id)]);
    const latest = await db.video.findMany({
      where: { ...PUBLIC_VIDEO_WHERE, isShort: video.isShort, id: { notIn: [...existing] } },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: relatedCandidateLimit - related.length,
      select: publicVideoCardSelect,
    });
    return [...related, ...latest.map((row) => publicVideoFromDb(row as unknown as DbVideo))];
  } catch {
    const catalog = await loadFallbackCatalog();
    const actressSet = new Set(actressIds);
    const tagSet = new Set(tagIds);
    return catalog.videos
      .filter((item) => item.id !== video.id && item.isShort === video.isShort)
      .map((item) => {
        const actressScore = item.actresses.some((actress) => actressSet.has(actress.id)) ? 16 : 0;
        const workScore = item.work?.id && item.work.id === video.workId ? 12 : 0;
        const tagScore = item.tags.filter((tag) => tagSet.has(tag.id)).length * 4;
        const yearScore = item.year && item.year === video.year ? 1 : 0;
        return { item, score: actressScore + workScore + tagScore + yearScore };
      })
      .sort((a, b) => b.score - a.score || dateScore(b.item.publishedAt) - dateScore(a.item.publishedAt))
      .slice(0, relatedCandidateLimit)
      .map((row) => row.item);
  }
}

const cachedRelatedCandidateSet = unstable_cache(
  (video: RelatedVideoContext) => buildRelatedCandidateSet(video),
  ["public-related-candidates-v2"],
  { revalidate: 300, tags: ["catalog"] },
);

async function relatedCandidates(video: RelatedVideoContext) {
  return process.env.NODE_ENV === "production"
    ? cachedRelatedCandidateSet(video)
    : buildRelatedCandidateSet(video);
}

async function relatedVideosFromContext(video: RelatedVideoContext, limit = 12, offset = 0) {
  const safeLimit = Math.min(24, Math.max(1, limit));
  const safeOffset = Math.min(144, Math.max(0, Math.floor(offset)));
  const candidates = await relatedCandidates(video);
  const items = candidates.slice(safeOffset, safeOffset + safeLimit);
  return { items, hasMore: safeOffset + items.length < candidates.length };
}

export async function getRelatedVideos(video: PublicVideo, limit = 12, offset = 0) {
  const result = await relatedVideosFromContext(relatedContextFromVideo(video), limit, offset);
  return result.items;
}

export async function getRelatedVideosForSlug(slug: string, limit = 12, offset = 0) {
  const context = await findRelatedVideoContext(slug);
  return context ? relatedVideosFromContext(context, limit, offset) : null;
}

export async function listAllPublicVideos(options: {
  includeShorts?: boolean;
  isShort?: boolean;
  sort?: "latest" | "popular";
  limit?: number;
} = {}) {
  if (!liveDbCatalogEnabled() && !options.includeShorts && !options.isShort) {
    const catalog = await loadFallbackCatalog();
    const rows = catalog.videos.filter((video) => (
      options.includeShorts ? true : video.isShort === (options.isShort ?? false)
    ));
    const sorted = sortVideos(rows, options.sort);
    return typeof options.limit === "number" ? sorted.slice(0, options.limit) : sorted;
  }
  try {
    const rows = await db.video.findMany({
      where: {
        ...PUBLIC_VIDEO_WHERE,
        ...(options.includeShorts ? {} : { isShort: options.isShort ?? false }),
      },
      orderBy: options.sort === "popular"
        ? [{ viewCount: "desc" }, { id: "asc" }]
        : [{ publishedAt: "desc" }, { id: "desc" }],
      ...(typeof options.limit === "number" ? { take: options.limit } : {}),
      include: publicVideoInclude,
    });
    return rows.map((row) => publicVideoFromDb(row as unknown as DbVideo));
  } catch {
    const catalog = await getCatalog();
    const rows = catalog.videos.filter((video) => (
      options.includeShorts ? true : video.isShort === (options.isShort ?? false)
    ));
    const sorted = sortVideos(rows, options.sort);
    return typeof options.limit === "number" ? sorted.slice(0, options.limit) : sorted;
  }
}

export type PublicVideoSitemapEntry = {
  slug: string;
  title: string;
  description: string;
  durationSeconds: number;
  videoUrl: string;
  thumbnailUrl: string;
};

async function listPublicVideoSitemapEntriesUncached(): Promise<PublicVideoSitemapEntry[]> {
  if (!liveDbCatalogEnabled()) {
    const catalog = await loadFallbackCatalog();
    return catalog.videos
      .filter((video) => !video.isShort)
      .map((video) => ({
        slug: video.slug,
        title: video.title,
        description: video.seoDescription || video.description,
        durationSeconds: video.durationSeconds,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
      }));
  }
  try {
    // Do not use listAllPublicVideos here: its full actress/work/tag includes
    // made the 7k-entry video sitemap exceed a Worker request budget and
    // silently fall back to an empty XML document. Crawlers only need these
    // seven scalar fields for a valid Video sitemap entry.
    const rows = await db.video.findMany({
      where: { ...PUBLIC_VIDEO_WHERE, isShort: false },
      select: {
        slug: true,
        title: true,
        description: true,
        seoDescription: true,
        durationSeconds: true,
        r2VideoKey: true,
        videoUrl: true,
        r2ThumbnailKey: true,
        thumbnailUrl: true,
        id: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      description: compactText(row.seoDescription, 2048) || compactText(row.description, 2048) || `Watch ${row.title} on Actrezz.`,
      durationSeconds: row.durationSeconds ?? 0,
      videoUrl: mediaUrl(row.r2VideoKey || row.videoUrl || `videos/${row.id}.mp4`),
      thumbnailUrl: mediaUrl(row.r2ThumbnailKey || row.thumbnailUrl || `thumbnails/${row.id}.webp`),
    }));
  } catch {
    return [];
  }
}

const cachedPublicVideoSitemapEntries = unstable_cache(
  () => listPublicVideoSitemapEntriesUncached(),
  ["public-video-sitemap-v1"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["catalog"] },
);

export async function listPublicVideoSitemapEntries() {
  return process.env.NODE_ENV === "production"
    ? cachedPublicVideoSitemapEntries()
    : listPublicVideoSitemapEntriesUncached();
}

export async function getPublicSitemapData() {
  if (!liveDbCatalogEnabled()) return await snapshotSitemapData();
  try {
    const [videos, actresses, movies, tvSeries, tags, years] = await Promise.all([
      db.video.findMany({
        where: PUBLIC_VIDEO_WHERE,
        select: { slug: true, isShort: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      db.actress.findMany({
        where: { isPublished: true, videoCount: { gt: 0 } },
        select: { slug: true, videoCount: true, updatedAt: true },
        orderBy: [{ sortName: "asc" }, { id: "asc" }],
      }),
      db.work.findMany({
        where: { isPublished: true, videoCount: { gt: 0 }, type: "MOVIE" },
        select: { slug: true, videoCount: true, updatedAt: true },
        orderBy: [{ sortTitle: "asc" }, { id: "asc" }],
      }),
      db.work.findMany({
        where: { isPublished: true, videoCount: { gt: 0 }, type: "TV_SHOW" },
        select: { slug: true, videoCount: true, updatedAt: true },
        orderBy: [{ sortTitle: "asc" }, { id: "asc" }],
      }),
      db.tag.findMany({
        where: { videoCount: { gt: 1 }, slug: { notIn: EXCLUDED_PUBLIC_TAG_SLUGS } },
        select: { slug: true, videoCount: true },
        orderBy: [{ videoCount: "desc" }, { name: "asc" }, { id: "asc" }],
      }),
      db.yearStat.findMany({
        where: { videoCount: { gt: 0 } },
        select: { year: true, videoCount: true, updatedAt: true },
        orderBy: { year: "desc" },
      }),
    ]);
    const generatedAt = new Date().toISOString();
    return {
      generatedAt,
      counts: {
        videos: videos.filter((video) => !video.isShort).length,
        shorts: videos.filter((video) => video.isShort).length,
        actresses: actresses.length,
        movies: movies.length,
        tvSeries: tvSeries.length,
        tags: tags.length,
        years: years.length,
      },
      videos: videos.map((video) => ({ slug: video.slug, isShort: video.isShort, updatedAt: video.updatedAt.toISOString() })),
      actresses: actresses.map((actress) => ({ slug: actress.slug, videoCount: actress.videoCount, updatedAt: actress.updatedAt.toISOString() })),
      movies: movies.map((work) => ({ slug: work.slug, videoCount: work.videoCount, updatedAt: work.updatedAt.toISOString() })),
      tvSeries: tvSeries.map((work) => ({ slug: work.slug, videoCount: work.videoCount, updatedAt: work.updatedAt.toISOString() })),
      tags: tags.filter((tag) => isPublicTagSlug(tag.slug)),
      years: years.map((year) => ({ year: year.year, videoCount: year.videoCount, updatedAt: year.updatedAt.toISOString() })),
    };
  } catch {
    const catalog = await loadFallbackCatalog();
    return {
      generatedAt: catalog.generatedAt,
      counts: catalog.counts,
      videos: catalog.videos.map((video) => ({ slug: video.slug, isShort: video.isShort, updatedAt: video.updatedAt })),
      actresses: catalog.actresses.map((actress) => ({ slug: actress.slug, videoCount: actress.videoCount, updatedAt: actress.updatedAt })),
      movies: catalog.works.filter((work) => work.type === "MOVIE").map((work) => ({ slug: work.slug, videoCount: work.videoCount, updatedAt: work.updatedAt })),
      tvSeries: catalog.works.filter((work) => work.type === "TV_SHOW").map((work) => ({ slug: work.slug, videoCount: work.videoCount, updatedAt: work.updatedAt })),
      tags: catalog.tags.filter((tag) => isPublicTagSlug(tag.slug) && tag.videoCount > 1).map((tag) => ({ slug: tag.slug, videoCount: tag.videoCount })),
      years: catalog.years.map((year) => ({ year: year.year, videoCount: year.videoCount, updatedAt: year.updatedAt })),
    };
  }
}

/**
 * A focused discovery feed for the Shorties topic landing pages. The source
 * clips themselves are deliberately omitted: this gives crawlers one useful
 * canonical page per curated topic instead of thousands of near-identical
 * reel URLs competing for the same crawl budget.
 */
export async function getShortiesSeoTagSitemapData() {
  const fallback = async () => {
    const catalog = await loadFallbackCatalog();
    const tagsById = new Map<string, { slug: string; updatedAt?: string }>();
    const counts = new Map<string, number>();
    for (const video of catalog.videos) {
      if (!video.isShort) continue;
      for (const tag of video.tags) {
        if (!isShortiesSeoTagSlug(tag.slug)) continue;
        tagsById.set(tag.id, { slug: tag.slug, updatedAt: video.updatedAt });
        counts.set(tag.id, (counts.get(tag.id) || 0) + 1);
      }
    }
    return [...tagsById.entries()]
      .map(([id, tag]) => ({ slug: tag.slug, videoCount: counts.get(id) || 0, updatedAt: tag.updatedAt }))
      .filter((tag) => tag.videoCount >= 2)
      .sort((a, b) => b.videoCount - a.videoCount || a.slug.localeCompare(b.slug));
  };

  if (!liveDbCatalogEnabled()) return await fallback();
  try {
    const candidates = await db.tag.findMany({
      where: {
        slug: { in: [...SHORTIES_SEO_TAG_SLUGS] },
        videos: { some: { video: { ...PUBLIC_VIDEO_WHERE, isShort: true } } },
      },
      select: { id: true, slug: true },
    });
    if (!candidates.length) return [];
    const grouped = await db.videoTag.groupBy({
      by: ["tagId"],
      where: {
        tagId: { in: candidates.map((tag) => tag.id) },
        video: { ...PUBLIC_VIDEO_WHERE, isShort: true },
      },
      _count: { _all: true },
    });
    const countByTagId = new Map(grouped.map((row) => [row.tagId, row._count._all]));
    return candidates
      .map((tag) => ({ slug: tag.slug, videoCount: countByTagId.get(tag.id) || 0 }))
      .filter((tag) => tag.videoCount >= 2)
      .sort((a, b) => b.videoCount - a.videoCount || a.slug.localeCompare(b.slug));
  } catch {
    return await fallback();
  }
}

export async function getSearchSuggestions(query: string) {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { items: [] as { kind: "video" | "actress"; slug: string; label: string }[] };
  if (!liveDbCatalogEnabled()) {
    const catalog = await loadFallbackCatalog();
    const clean = normalizeSearch(q);
    const videos = sortVideos(catalog.videos.filter((video) => !video.isShort && normalizeSearch(video.title).includes(clean))).slice(0, 5);
    const actresses = catalog.actresses
      .filter((actress) => normalizeSearch(actress.name).includes(clean))
      .sort((a, b) => b.videoCount - a.videoCount || a.name.localeCompare(b.name))
      .slice(0, 4);
    return {
      items: [
        ...videos.map((video) => ({ kind: "video" as const, slug: video.slug, label: video.title })),
        ...actresses.map((actress) => ({ kind: "actress" as const, slug: actress.slug, label: actress.name })),
      ],
    };
  }
  try {
    const [videos, actresses] = await Promise.all([
      db.video.findMany({
        where: { ...PUBLIC_VIDEO_WHERE, isShort: false, title: { contains: q, mode: "insensitive" } },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: 5,
        select: { slug: true, title: true },
      }),
      db.actress.findMany({
        where: { isPublished: true, name: { contains: q, mode: "insensitive" } },
        orderBy: [{ videoCount: "desc" }, { name: "asc" }, { id: "asc" }],
        take: 4,
        select: { slug: true, name: true },
      }),
    ]);
    return {
      items: [
        ...videos.map((video) => ({ kind: "video" as const, slug: video.slug, label: video.title })),
        ...actresses.map((actress) => ({ kind: "actress" as const, slug: actress.slug, label: actress.name })),
      ],
    };
  } catch {
    const catalog = await getCatalog();
    const clean = normalizeSearch(q);
    const videos = sortVideos(catalog.videos.filter((video) => !video.isShort && normalizeSearch(video.title).includes(clean))).slice(0, 5);
    const actresses = catalog.actresses
      .filter((actress) => normalizeSearch(actress.name).includes(clean))
      .sort((a, b) => b.videoCount - a.videoCount || a.name.localeCompare(b.name))
      .slice(0, 4);
    return {
      items: [
        ...videos.map((video) => ({ kind: "video" as const, slug: video.slug, label: video.title })),
        ...actresses.map((actress) => ({ kind: "actress" as const, slug: actress.slug, label: actress.name })),
      ],
    };
  }
}

async function loadPublicNotifications() {
  const mapVideo = (video: PublicVideo) => {
    const actress = video.actresses[0];
    return {
      id: video.id,
      title: video.title,
      slug: video.slug,
      thumbnailUrl: video.thumbnailUrl,
      publishedAt: video.publishedAt,
      isShort: video.isShort,
      actress: actress ? {
        id: actress.id,
        name: actress.name,
        slug: actress.slug,
        profileImageUrl: actress.profileImageUrl,
        initials: actress.initials,
        color: actress.color,
      } : null,
    };
  };

  if (!liveDbCatalogEnabled()) {
    const catalog = await loadFallbackCatalog();
    return sortVideos(catalog.videos).slice(0, 10).map(mapVideo);
  }

  try {
    const rows = await db.video.findMany({
      where: PUBLIC_VIDEO_WHERE,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        title: true,
        slug: true,
        r2ThumbnailKey: true,
        thumbnailUrl: true,
        publishedAt: true,
        createdAt: true,
        isShort: true,
        actresses: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: {
            actress: {
              select: {
                id: true,
                name: true,
                slug: true,
                profileImage: true,
                videoCount: true,
              },
            },
          },
        },
      },
    });
    return rows.map((row) => {
      const actress = row.actresses[0]?.actress ? publicActress(row.actresses[0].actress) : null;
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        thumbnailUrl: mediaUrl(row.r2ThumbnailKey || row.thumbnailUrl || `thumbnails/${row.id}.webp`),
        publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
        isShort: Boolean(row.isShort),
        actress: actress ? {
          id: actress.id,
          name: actress.name,
          slug: actress.slug,
          profileImageUrl: actress.profileImageUrl,
          initials: actress.initials,
          color: actress.color,
        } : null,
      };
    });
  } catch {
    const catalog = await loadFallbackCatalog();
    return sortVideos(catalog.videos).slice(0, 10).map(mapVideo);
  }
}

export const getPublicNotifications = unstable_cache(
  loadPublicNotifications,
  ["public-notifications"],
  { revalidate: 60, tags: ["catalog"] },
);

const intentAliases: Record<string, string[]> = {
  nude: ["nude", "naked"],
  naked: ["naked", "nude"],
  topless: ["topless"],
  sex: ["sex scene", "sex scenes"],
  sexy: ["sexy"],
  underwear: ["underwear", "lingerie"],
  lingerie: ["lingerie", "underwear"],
  bikini: ["bikini"],
  cleavage: ["cleavage"],
  breasts: ["breasts"],
  boobs: ["boobs"],
  ass: ["ass"],
};

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function intentTermsFromVideos(videos: PublicVideo[]) {
  const tags = videos.flatMap((video) => video.tags.map((tag) => tag.name.toLowerCase()));
  const priority = ["nude", "naked", "topless", "sex", "sexy", "underwear", "lingerie", "bikini", "cleavage", "breasts", "boobs", "ass"];
  return unique(priority.flatMap((intent) => {
    const matches = tags.some((tag) => new RegExp(`(^|[^a-z])${intent}([^a-z]|$)`, "i").test(tag));
    return matches ? intentAliases[intent] ?? [] : [];
  })).slice(0, 10);
}

function primarySceneLabel(terms: string[]) {
  const primary = terms[0]?.toLowerCase();
  if (!primary) return "Videos, Movie & TV Scenes";
  if (primary === "nude" || primary === "naked") return "Nude Scenes & Videos";
  if (primary === "sex scene" || primary === "sex scenes") return "Sex Scenes & Videos";
  if (primary === "topless") return "Topless Scenes & Videos";
  return `${titleCase(primary)} Scenes & Videos`;
}

export function videoSeo(video: PublicVideo) {
  const names = video.actresses.map((actress) => actress.name);
  const terms = intentTermsFromVideos([video]);
  const primaryName = names[0] || "Actress";
  const primaryTerm = terms[0] ? titleCase(terms[0]) : "";
  const generatedTitle = `${primaryName}${primaryTerm ? ` ${primaryTerm}` : ""} Video${video.work ? ` – ${video.work.title}` : ""}${video.year ? ` (${video.year})` : ""}`;
  // Imported seoTitle values describe the work and primary actress. That is
  // useful as a label, but repeats for every scene from the same work. The
  // source title is the individual scene identity and is already used as the
  // page H1, so use its concise form for the long-form document title too.
  const sourceTitle = video.title.replace(/\s+/g, " ").trim();
  const title = sourceTitle || generatedTitle;
  const description = `Watch ${names.join(", ") || primaryName}${terms[0] ? ` in a ${terms[0]}` : ""} video${video.work ? ` from ${video.work.title}` : ""}${video.year ? ` (${video.year})` : ""}. ${video.description}`.replace(/\s+/g, " ").slice(0, 300);
  const keywords = unique([
    ...names.flatMap((name) => [`${name} video`, `${name} videos`, ...terms.flatMap((term) => [`${name} ${term}`, `${name} ${term} video`, `${name} ${term} scene`])]),
    video.work ? `${video.work.title} sex scenes` : "",
    video.work ? `${video.work.title} nude scenes` : "",
    video.work ? `${video.work.title} ${primaryName}` : "",
    ...video.tags.filter((tag) => isPublicTagSlug(tag.slug)).map((tag) => tag.name),
  ]).filter(Boolean).slice(0, 35);

  if (video.isShort) {
    const subject = names.join(", ") || "Woman";
    const storedTitle = (video.seoTitle || video.title)
      .replace(/\s*\|\s*Actrezz(?:\s+Shorts)?\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const withoutSubject = names.reduce(
      (value, name) => value.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " "),
      storedTitle,
    );
    const meaningfulWords = withoutSubject
      .replace(/\b(short|video|clip|actrezz|celebrity|woman)\b/gi, " ")
      .replace(/[^a-z0-9]+/gi, " ")
      .trim();
    const sceneLabel = primaryTerm ? `${primaryTerm} Scene` : "Trending Clip";
    const shortTitle = meaningfulWords
      ? /\bshort(?:\s+video)?\b/i.test(storedTitle)
        ? storedTitle.replace(/\bshort\b(?!\s+video)/i, "Short Video")
        : `${storedTitle} Short Video`
      : `${subject} ${sceneLabel} Short Video`;
    const shortDescription = (
      video.seoDescription ||
      `Watch ${subject}${terms[0] ? ` in this ${terms[0]}` : " in this vertical"} short video${video.work ? ` from ${video.work.title}` : ""}. Stream the selected clip on Actrezz.`
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    const shortKeywords = unique([
      ...names.flatMap((name) => [
        `${name} short video`,
        `${name} video`,
        ...terms.flatMap((term) => [`${name} ${term}`, `${name} ${term} video`, `${name} ${term} short`]),
      ]),
      "celebrity short videos",
      "hot celebrity shorts",
      "hot shorts videos",
      "hot reels",
      "adult reels",
      ...(terms.some((term) => term === "sex") ? ["sex shorts", "sex reels"] : []),
      ...(terms.some((term) => term === "nude" || term === "naked") ? ["nude short video", "nude reels"] : []),
    ])
      .filter(Boolean)
      .slice(0, 30);

    return {
      title: shortTitle.slice(0, 90),
      description: shortDescription,
      keywords: shortKeywords,
      terms,
    };
  }

  return { title: title.slice(0, 95), description: video.seoDescription || description, keywords: video.seoKeywords.length ? video.seoKeywords : keywords, terms };
}

export function actressSeo(actress: PublicActress, videos: PublicVideo[]) {
  const terms = intentTermsFromVideos(videos);
  const works = unique(videos.map((video) => video.work?.title ?? "").filter(Boolean)).slice(0, 5);
  const heading = `${actress.name} ${primarySceneLabel(terms)}`;
  const title = heading;
  const description = `Explore ${actress.name}'s curated video collection${terms.length ? `, including ${terms.slice(0, 5).join(", ")} scenes` : ""}${works.length ? ` from ${works.join(", ")}` : ""}. Discover related movies, TV series, tags and years.`;
  const keywords = unique([
    `${actress.name} video`, `${actress.name} videos`, `${actress.name} movie scenes`, `${actress.name} TV scenes`,
    ...terms.flatMap((term) => [`${actress.name} ${term}`, `${actress.name} ${term} video`, `${actress.name} ${term} scenes`]),
    ...works.map((work) => `${actress.name} ${work}`),
  ]).slice(0, 35);
  return { title: title.slice(0, 95), heading, description: description.slice(0, 300), keywords };
}

export function workSeo(work: PublicWork, videos: PublicVideo[]) {
  const terms = intentTermsFromVideos(videos);
  const actresses = unique(videos.flatMap((video) => video.actresses.map((actress) => actress.name))).slice(0, 6);
  const noun = work.type === "TV_SHOW" ? "TV Series" : "Movie";
  const heading = `${work.title} ${primarySceneLabel(terms)}`;
  // A movie and a TV series can share the same name. Keep the page heading
  // human-friendly, but include the work type in the document title so their
  // canonical pages do not compete as duplicate titles.
  const title = `${heading} ${noun}`;
  const description = `${work.title} ${noun.toLowerCase()} video catalogue${work.releaseYear ? ` (${work.releaseYear})` : ""}${terms.length ? ` with ${terms.slice(0, 5).join(", ")} scenes` : ""}${actresses.length ? ` featuring ${actresses.join(", ")}` : ""}. ${work.description || ""}`.replace(/\s+/g, " ").slice(0, 300);
  const keywords = unique([
    `${work.title} videos`, `${work.title} sex scenes`, `${work.title} nude scenes`, `${work.title} movie scenes`, `${work.title} hot scenes`,
    ...terms.map((term) => `${work.title} ${term}`),
    ...actresses.map((name) => `${name} ${work.title}`),
  ]).slice(0, 35);
  return { title: title.slice(0, 95), heading, description, keywords };
}

export function tagSeo(tag: PublicTag, videos: PublicVideo[]) {
  const actresses = unique(videos.flatMap((video) => video.actresses.map((actress) => actress.name))).slice(0, 6);
  return {
    title: `${titleCase(tag.name)} Videos & Scenes`,
    description: `Explore curated ${tag.name} scenes and related videos${actresses.length ? ` featuring ${actresses.join(", ")}` : ""}.`,
    keywords: unique([`${tag.name} videos`, `${tag.name} scenes`, ...actresses.map((name) => `${name} ${tag.name}`)]).slice(0, 30),
  };
}
