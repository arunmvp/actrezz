import type { MetadataRoute } from "next";
import { getPublicSitemapData } from "@/lib/public-catalog";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online";

export const revalidate = 3600;

function modified(value?: string, fallback = new Date()) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getPublicSitemapData();
  const now = modified(data.generatedAt);
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/actresses`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/movies`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/tv-series`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/tags`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/years`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/trending`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.25 },
    { url: `${baseUrl}/copyright`, lastModified: now, changeFrequency: "yearly", priority: 0.25 },
    { url: `${baseUrl}/dmca`, lastModified: now, changeFrequency: "yearly", priority: 0.25 },
    { url: `${baseUrl}/2257`, lastModified: now, changeFrequency: "yearly", priority: 0.25 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.25 },
  ];

  return [
    ...staticPages,
    ...data.actresses.map((person) => ({
      url: `${baseUrl}/actress/${person.slug}`, lastModified: modified(person.updatedAt, now), changeFrequency: "weekly" as const, priority: 0.8,
    })),
    // Individual Shorts are intentionally excluded from the sitemap. Only
    // actress-linked Shorts may remain indexable via their canonical URL.
    ...data.videos.filter((video) => !video.isShort).map((video) => ({
      url: `${baseUrl}/watch/${video.slug}`,
      lastModified: modified(video.updatedAt, now),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...data.movies.map((work) => ({
      url: `${baseUrl}/movie/${work.slug}`, lastModified: modified(work.updatedAt, now), changeFrequency: "weekly" as const, priority: 0.65,
    })),
    ...data.tvSeries.map((work) => ({
      url: `${baseUrl}/tv-series/${work.slug}`, lastModified: modified(work.updatedAt, now), changeFrequency: "weekly" as const, priority: 0.65,
    })),
    ...data.tags.map((tag) => ({
      url: `${baseUrl}/tag/${tag.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.55,
    })),
    ...data.years.map((year) => ({
      url: `${baseUrl}/year/${year.year}`, lastModified: modified(year.updatedAt, now), changeFrequency: "monthly" as const, priority: 0.55,
    })),
  ];
}
