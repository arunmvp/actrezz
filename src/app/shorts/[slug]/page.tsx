import type { Metadata } from "next";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { PublicShell } from "@/components/public/PublicShell";
import { ShortsReelPlayerClient } from "@/components/public/ShortsReelPlayerClient";
import { getShortPlayerFeed, videoSeo } from "@/lib/public-catalog";

// New Shorts are available from the catalogue database immediately after the
// admin publish flow. Do not cache an on-demand 404 for an hour while a fresh
// record is still absent from the bundled public snapshot.
export const dynamic = "force-dynamic";

const getShortPage = cache((slug: string) => getShortPlayerFeed(slug));

function absoluteUrl(value: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online";
  try { return new URL(value, baseUrl).toString(); }
  catch { return `${baseUrl}${value.startsWith("/") ? "" : "/"}${value}`; }
}

function isoDuration(seconds: number) {
  if (!seconds || seconds <= 0) return undefined;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `PT${minutes ? `${minutes}M` : ""}${secs || !minutes ? `${secs}S` : ""}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getShortPage(slug);
  if (!result) return {};
  const video = result.video;
  const seo = videoSeo(video);
  const title = seo.title;
  const description = seo.description.slice(0, 300);
  const canonical = `/shorts/${video.slug}`;
  return {
    title,
    description,
    keywords: seo.keywords,
    // Imported, unlinked Shorts are useful to visitors but must not dilute the
    // celebrity catalogue in Search. A Short is eligible only when it is tied
    // to at least one known actress record.
    robots: { index: video.actresses.length > 0, follow: true },
    alternates: { canonical },
    openGraph: {
      type: "video.other",
      title,
      description,
      url: canonical,
      images: [{ url: video.thumbnailUrl, width: 720, height: 1280, alt: `${title} poster` }],
      videos: [{ url: video.videoUrl, type: "video/mp4" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [video.thumbnailUrl] },
    other: { rating: "adult" },
  };
}

export default async function ShortPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getShortPage(slug);
  if (!result) notFound();
  if (slug === result.video.id) permanentRedirect(`/shorts/${result.video.slug}`);
  const video = result.video;
  const seo = videoSeo(video);
  const shortsBannerZoneIds = (process.env.EXOCLICK_SHORTS_REEL_BANNER_ZONE_IDS || "")
    .split(",").map((value) => value.trim()).filter((value) => /^\d+$/.test(value));
  const actors = video.actresses.map((actress) => ({ "@type": "Person", name: actress.name, url: absoluteUrl(`/actress/${actress.slug}`) }));
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: seo.title,
    description: seo.description,
    thumbnailUrl: [absoluteUrl(video.thumbnailUrl)],
    uploadDate: video.publishedAt,
    duration: isoDuration(video.durationSeconds),
    contentUrl: absoluteUrl(video.videoUrl),
    embedUrl: absoluteUrl(`/shorts/${video.slug}`),
    isFamilyFriendly: false,
    ...(actors.length ? { actor: actors } : {}),
  };

  return (
    <PublicShell flush mobileImmersive>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <article className="grid h-dvh place-items-center overflow-hidden bg-black text-white sm:h-[calc(100dvh-56px)] sm:bg-yt-bg">
        <div className="relative aspect-[9/16] h-full max-h-[820px] max-w-full overflow-hidden bg-black sm:rounded-2xl">
          <img src={video.thumbnailUrl} alt={`${seo.title} short video thumbnail`} className="h-full w-full object-contain opacity-75" />
          <div className="absolute inset-0 grid place-items-center bg-black/20"><span className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/25 border-t-white" /></div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-5 pt-24"><h1 className="text-base font-semibold">{seo.title}</h1><p className="mt-1 line-clamp-2 text-sm text-white/75">{seo.description}</p></div>
        </div>
      </article>
      <ShortsReelPlayerClient videos={result.items} initialIndex={result.initialIndex} vastUrl={process.env.EXOCLICK_SHORTS_VAST_URL} bannerZoneIds={shortsBannerZoneIds} bannerProviderUrl={process.env.EXOCLICK_AD_PROVIDER_URL || "https://a.magsrv.com/ad-provider.js"} />
    </PublicShell>
  );
}
