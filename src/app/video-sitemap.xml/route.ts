import { listPublicVideoSitemapEntries, PUBLIC_REVALIDATE_SECONDS } from "@/lib/public-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

function xml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character] || character);
}

function absoluteUrl(value: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online";
  try {
    return new URL(value, siteUrl).toString();
  } catch {
    return `${siteUrl}${value.startsWith("/") ? "" : "/"}${value}`;
  }
}

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online";
  // Shorties use topic landing pages for sitemap discovery; only full watch
  // pages belong in the video sitemap.
  const entries = (await listPublicVideoSitemapEntries()).map((video) => {
    return `<url>
  <loc>${xml(`${siteUrl}/watch/${video.slug}`)}</loc>
  <video:video>
    <video:thumbnail_loc>${xml(absoluteUrl(video.thumbnailUrl))}</video:thumbnail_loc>
    <video:title>${xml(video.title.slice(0, 100))}</video:title>
    <video:description>${xml(video.description.slice(0, 2048))}</video:description>
    <video:content_loc>${xml(absoluteUrl(video.videoUrl))}</video:content_loc>
    ${video.durationSeconds > 0 ? `<video:duration>${Math.min(28800, Math.round(video.durationSeconds))}</video:duration>` : ""}
    <video:family_friendly>no</video:family_friendly>
  </video:video>
</url>`;
  }).join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${entries}
</urlset>`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=0, s-maxage=${PUBLIC_REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
    },
  });
}
