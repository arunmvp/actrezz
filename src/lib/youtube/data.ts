import localCatalog from "./local-catalog.generated.json";

export interface Channel {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  profileImageUrl?: string;
  videoCount: number;
  subscribers: number;
  verified: boolean;
  banner: string;
  description: string;
  joined: string;
  totalViews: number;
  joinedYearsAgo: number;
}

export interface Video {
  id: string;
  slug?: string;
  title: string;
  channelId: string;
  actressIds?: string[];
  views: number;
  uploadedAt: number;
  durationSec: number;
  videoUrl: string;
  thumbnailUrl?: string;
  category: string;
  workTitle?: string;
  workSlug?: string;
  workType?: "MOVIE" | "TV_SHOW";
  year?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  tags?: string[];
  tagSlugs?: string[];
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  description: string;
  likes: number;
  thumbSeed: string;
  live?: boolean;
  isNew?: boolean;
  isShort?: boolean;
  trendingScore?: number;
}

export interface ShortVideo {
  id: string;
  title: string;
  channelId: string;
  views: number;
  likes: number;
  comments: number;
  videoUrl: string;
  thumbSeed: string;
}

export interface CommentT {
  id: string;
  author: string;
  handle: string;
  initials: string;
  color: string;
  text: string;
  likes: number;
  createdAt: number;
  replies: { author: string; initials: string; color: string; text: string; likes: number; createdAt: number }[];
  pinned?: boolean;
  creatorHeart?: boolean;
}

export const CATEGORIES = [
  "All",
  "Latest",
  "Movies",
  "TV Series",
  "Trending",
  "2020s",
  "2010s",
  "Recently added",
];

const gradients = [
  ["#3b1d5a", "#c026d3"],
  ["#172554", "#2563eb"],
  ["#4c0519", "#e11d48"],
  ["#052e16", "#16a34a"],
  ["#431407", "#ea580c"],
  ["#312e81", "#7c3aed"],
  ["#083344", "#0891b2"],
];

const publicMediaUrl = process.env.NODE_ENV === "production"
  ? process.env.NEXT_PUBLIC_MEDIA_URL?.replace(/\/$/, "")
  : undefined;

function gradientFor(value: string, offset = 0) {
  const score = [...value].reduce((sum, char) => sum + char.charCodeAt(0), offset);
  const [from, to] = gradients[score % gradients.length];
  return `linear-gradient(135deg,${from},${to})`;
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

const actressVideoCounts = new Map<string, number>();
for (const video of localCatalog.videos) {
  for (const person of video.actresses) actressVideoCounts.set(person.id, (actressVideoCounts.get(person.id) ?? 0) + 1);
}

export const CHANNELS: Channel[] = localCatalog.actresses.map((person) => ({
  id: person.id,
  name: person.name,
  handle: `@${person.slug}`,
  initials: initialsFor(person.name),
  color: gradientFor(person.slug),
  profileImageUrl: person.profileImageSlug
    ? publicMediaUrl
      ? `${publicMediaUrl}/actresses/${encodeURIComponent(person.profileImageSlug)}/profile.webp`
      : `/api/local-media/profile/${encodeURIComponent(person.profileImageSlug)}`
    : undefined,
  videoCount: actressVideoCounts.get(person.id) ?? 0,
  subscribers: 0,
  verified: false,
  banner: gradientFor(person.slug, 19),
  description: `${person.name} movie and television video catalogue.`,
  joined: "",
  totalViews: 0,
  joinedYearsAgo: 0,
}));

const channelIds = new Set(CHANNELS.map((person) => person.id));

function categoryFor(type?: string | null) {
  if (type === "TV_SHOW" || type === "TV_SERIES") return "TV Series";
  return "Movies";
}

function trendingScoreFor(item: (typeof localCatalog.videos)[number], index: number) {
  const tagBoost = (item.tags?.length ?? 0) * 120;
  const workBoost = item.work?.slug ? 300 : 0;
  const recentBoost = Math.max(0, 3000 - index * 4);
  const sizeBoost = Math.min(800, Math.round((Number(item.sizeBytes) || 0) / 1024 / 1024));
  return recentBoost + workBoost + tagBoost + sizeBoost;
}

const mappedVideos: Video[] = localCatalog.videos.map((item, index) => {
  const actressIds = item.actresses.map((person) => person.id);
  const primaryActressId = actressIds.find((id) => channelIds.has(id)) ?? CHANNELS[0]?.id ?? "unknown";
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    channelId: primaryActressId,
    actressIds,
    views: 0,
    uploadedAt: item.downloadedAt,
    durationSec: item.durationSeconds,
    videoUrl: publicMediaUrl ? `${publicMediaUrl}/videos/${encodeURIComponent(item.id)}.mp4` : `/api/local-media/video/${encodeURIComponent(item.id)}`,
    thumbnailUrl: publicMediaUrl ? `${publicMediaUrl}/thumbnails/${encodeURIComponent(item.id)}.webp` : `/api/local-media/thumbnail/${encodeURIComponent(item.id)}`,
    category: categoryFor(item.work?.type),
    workTitle: item.work?.title,
    workSlug: item.work?.slug,
    workType: item.work?.type as "MOVIE" | "TV_SHOW" | undefined,
    year: item.year ?? undefined,
    seasonNumber: item.seasonNumber ?? undefined,
    episodeNumber: item.episodeNumber ?? undefined,
    tags: item.tags.map((tag) => tag.name),
    tagSlugs: item.tags.map((tag) => tag.slug),
    seoTitle: item.seoTitle ?? undefined,
    seoDescription: item.seoDescription ?? undefined,
    seoKeywords: item.seoKeywords,
    description: item.description,
    likes: 0,
    thumbSeed: item.slug,
    isShort: Boolean(item.isShort),
    trendingScore: trendingScoreFor(item, index),
    isNew: index < 12,
  };
});

export const VIDEOS: Video[] = mappedVideos.filter((video) => !video.isShort);

export interface WorkDirectoryEntry {
  slug: string;
  title: string;
  type: "MOVIE" | "TV_SHOW";
  year?: number;
  description?: string;
  videoCount: number;
  thumbnailUrl?: string;
}

export interface TagDirectoryEntry {
  slug: string;
  name: string;
  videoCount: number;
}

export interface YearDirectoryEntry {
  year: number;
  videoCount: number;
}

const workMap = new Map<string, WorkDirectoryEntry>();
for (const item of localCatalog.videos.filter((video) => !video.isShort)) {
  if (!item.work?.slug) continue;
  const type = item.work.type as "MOVIE" | "TV_SHOW";
  const key = `${type}:${item.work.slug}`;
  const existing = workMap.get(key);
  if (existing) existing.videoCount += 1;
  else workMap.set(key, {
    slug: item.work.slug,
    title: item.work.title,
    type,
    year: item.year ?? undefined,
    description: item.work.description ?? undefined,
    videoCount: 1,
    thumbnailUrl: publicMediaUrl ? `${publicMediaUrl}/thumbnails/${encodeURIComponent(item.id)}.webp` : `/api/local-media/thumbnail/${encodeURIComponent(item.id)}`,
  });
}

export const WORKS = [...workMap.values()].sort((a, b) => a.title.localeCompare(b.title));
export const MOVIES = WORKS.filter((work) => work.type === "MOVIE");
export const TV_SERIES = WORKS.filter((work) => work.type === "TV_SHOW");

const tagMap = new Map<string, TagDirectoryEntry>();
for (const video of VIDEOS) {
  video.tags?.forEach((name, index) => {
    const slug = video.tagSlugs?.[index];
    if (!slug) return;
    const existing = tagMap.get(slug);
    if (existing) existing.videoCount += 1;
    else tagMap.set(slug, { slug, name, videoCount: 1 });
  });
}
export const TAGS = [...tagMap.values()].sort((a, b) => b.videoCount - a.videoCount || a.name.localeCompare(b.name));

const yearMap = new Map<number, number>();
for (const video of VIDEOS) {
  if (video.year) yearMap.set(video.year, (yearMap.get(video.year) ?? 0) + 1);
}
export const YEARS: YearDirectoryEntry[] = [...yearMap.entries()]
  .map(([year, videoCount]) => ({ year, videoCount }))
  .sort((a, b) => b.year - a.year);

const channelIdMap = new Map(CHANNELS.map((channel) => [channel.id, channel]));
const videoIdMap = new Map(VIDEOS.map((video) => [video.id, video]));
const videoSlugMap = new Map(VIDEOS.map((video) => [video.slug, video]));

export const channelById = (id: string): Channel => channelIdMap.get(id) ?? CHANNELS[0];
export const videoById = (id: string): Video | undefined => videoIdMap.get(id);
export const videoBySlug = (slug: string): Video | undefined => videoSlugMap.get(slug);

export const LATEST_VIDEOS = [...VIDEOS].sort((a, b) => b.uploadedAt - a.uploadedAt);
export const TRENDING_VIDEOS = [...VIDEOS].sort(
  (a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0) || b.uploadedAt - a.uploadedAt
);

export const SHORTS: ShortVideo[] = mappedVideos
  .filter((video) => video.isShort)
  .sort((a, b) => b.uploadedAt - a.uploadedAt)
  .map((video) => ({
    id: video.id,
    title: video.title,
    channelId: video.channelId,
    views: 0,
    likes: 0,
    comments: 0,
    videoUrl: video.videoUrl,
    thumbSeed: video.thumbSeed,
  }));
export const COMMENTS: CommentT[] = [];

export function commentsForVideo(_videoId?: string): CommentT[] {
  return [];
}

export interface NotificationItem {
  id: string;
  channelId: string;
  text: string;
  time: number;
  videoId?: string;
  thumbSeed: string;
}

export const NOTIFICATIONS: NotificationItem[] = LATEST_VIDEOS.slice(0, 9).map((video, index) => ({
  id: `local-${index + 1}`,
  channelId: video.channelId,
  text: `New video added: ${video.title}`,
  time: video.uploadedAt,
  videoId: video.id,
  thumbSeed: video.thumbSeed,
}));
