import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).default("");
const positive = (max: number) => z.number().int().min(0).max(max).nullable().optional();
const key = text(1024).refine((value) => !value || (!value.includes("..") && !value.includes("\\") && /^(videos|thumbnails|actresses)\//.test(value)), "Invalid media key");
const url = text(2048).refine((value) => !value || /^https?:\/\//i.test(value) || value.startsWith("/api/r2-media/"), "Use an HTTP(S) media URL or R2 upload");

export const videoInput = z.object({
  id: z.string().max(100).optional(),
  title: z.string().trim().min(3).max(250), description: text(10000),
  durationSeconds: positive(86400), year: z.number().int().min(1880).max(2100).nullable().optional(),
  seasonNumber: positive(1000), episodeNumber: positive(10000),
  isShort: z.boolean().default(false), status: z.enum(["DRAFT", "PROCESSING", "READY", "HIDDEN", "FAILED"]).default("DRAFT"),
  videoUrl: url, thumbnailUrl: url, r2VideoKey: key, r2ThumbnailKey: key,
  seoTitle: text(150), seoDescription: text(500), seoKeywords: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  actressIds: z.array(z.string().min(1).max(100)).max(12).default([]),
  workId: z.string().max(100).nullable().optional(), workTitle: text(250), workType: z.enum(["MOVIE", "TV_SHOW"]).default("MOVIE"), workDescription: text(4000),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  sourceProvider: text(40), sourcePageUrl: url, sourceMediaUrl: url,
});

export const actressInput = z.object({ name: z.string().trim().min(2).max(120), profileImage: url, seoDescription: text(500) });

export function r2KeyFromUrl(key: string, url: string, prefix: "videos" | "thumbnails") {
  let result = key;
  const base = (process.env.NEXT_PUBLIC_MEDIA_URL || "").replace(/\/+$/, "");
  if (!result && url.startsWith("/api/r2-media/")) result = decodeURIComponent(url.slice("/api/r2-media/".length));
  if (!result && base && url.startsWith(`${base}/`)) result = decodeURIComponent(url.slice(base.length + 1));
  if (!result.startsWith(`${prefix}/`) || result.includes("..") || result.includes("\\")) return "";
  return result;
}
