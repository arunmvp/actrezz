import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicWatchPlayer } from "@/components/public/PublicWatchPlayer";
import { RelatedVideosLoadMore } from "@/components/public/RelatedVideosLoadMore";
import { NeverBlockDisplayZone } from "@/components/ads/NeverBlockDisplayZone";
import { findPublicVideo, requirePublicVideo, videoSeo } from "@/lib/public-catalog";
import { isPublicTagSlug } from "@/lib/public-tag-policy";
import { formatDuration } from "@/lib/youtube/format";

export const revalidate = 3600;

function absoluteUrl(value: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return `${baseUrl}${value.startsWith("/") ? "" : "/"}${value}`;
  }
}

function isoDuration(seconds: number) {
  if (!seconds || seconds <= 0) return undefined;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${secs || (!hours && !minutes) ? `${secs}S` : ""}`;
}

export async function generateMetadata({ params }: { params: Promise<{ videoId: string }> }): Promise<Metadata> {
  const { videoId } = await params;
  const video = await findPublicVideo(videoId);
  if (!video) return {};
  const seo = videoSeo(video);
  const title = seo.title;
  const description = seo.description.slice(0, 300);
  return {
    title,
    description,
    keywords: seo.keywords,
    alternates: { canonical: `/watch/${video.slug}` },
    openGraph: {
      type: "video.other",
      title,
      description,
      url: `/watch/${video.slug}`,
      images: [{ url: video.thumbnailUrl, width: 1280, height: 720, alt: video.title }],
      videos: [{ url: video.videoUrl, type: "video/mp4" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [video.thumbnailUrl] },
    other: { rating: "adult" },
  };
}

export default async function Page({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  const video = await requirePublicVideo(videoId);
  const seo = videoSeo(video);
  const primaryActress = video.actresses[0];
  const adProviderUrl = process.env.EXOCLICK_AD_PROVIDER_URL;
  const desktopTopAdZone = process.env.EXOCLICK_WATCH_DESKTOP_TOP_ZONE_ID;
  const desktopBottomAdZone = process.env.EXOCLICK_WATCH_DESKTOP_BOTTOM_ZONE_ID;
  const mobileAdZone = process.env.EXOCLICK_WATCH_MOBILE_BANNER_ZONE_ID || process.env.EXOCLICK_WATCH_MOBILE_ZONE_ID;
  const hasDesktopRail = Boolean(desktopTopAdZone || desktopBottomAdZone);
  const adKeywords = seo.keywords.slice(0, 20).join(",");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title,
    description: seo.description,
    thumbnailUrl: [absoluteUrl(video.thumbnailUrl)],
    uploadDate: video.publishedAt,
    duration: isoDuration(video.durationSeconds),
    contentUrl: absoluteUrl(video.videoUrl),
    embedUrl: absoluteUrl(`/watch/${video.slug}`),
    isFamilyFriendly: false,
    actor: video.actresses.map((actress) => ({ "@type": "Person", name: actress.name, url: absoluteUrl(`/actress/${actress.slug}`) })),
    partOfSeries: video.work?.type === "TV_SHOW" ? { "@type": "TVSeries", name: video.work.title, url: absoluteUrl(`/tv-series/${video.work.slug}`) } : undefined,
    partOfMovie: video.work?.type === "MOVIE" ? { "@type": "Movie", name: video.work.title, url: absoluteUrl(`/movie/${video.work.slug}`) } : undefined,
  };

  return (
    <PublicShell wide>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <div className={`watch-layout grid gap-6 ${adProviderUrl && hasDesktopRail ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <article className="min-w-0">
          <div className="-mx-3 overflow-hidden rounded-none bg-black shadow-2xl shadow-black/30 sm:mx-0 sm:rounded-2xl">
            <PublicWatchPlayer
              videoId={video.id}
              title={video.title}
              src={video.videoUrl}
              poster={video.thumbnailUrl}
              durationSec={video.durationSeconds}
              inStreamVastUrl={process.env.EXOCLICK_INSTREAM_VAST_URL}
              pauseDesktopVastUrl={process.env.EXOCLICK_PAUSE_DESKTOP_VAST_URL}
              pauseMobileVastUrl={process.env.EXOCLICK_PAUSE_MOBILE_VAST_URL}
            />
          </div>

          {adProviderUrl && mobileAdZone && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-yt-border/70 bg-yt-surface2 px-2 py-4 xl:hidden">
              <NeverBlockDisplayZone zoneId={mobileAdZone} providerUrl={adProviderUrl} keywords={adKeywords} mediaQuery="(max-width: 1279px)" zoneClassName={process.env.EXOCLICK_WATCH_MOBILE_BANNER_ZONE_ID ? "eas6a97888e10" : "eas6a97888e38"} />
            </div>
          )}

          <div className="mt-4">
            <h1 className="text-base font-semibold leading-6 text-yt-text sm:text-lg">{video.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-yt-text2">
              {primaryActress && <Link href={`/actress/${primaryActress.slug}`} className="rounded-full bg-yt-surface2 px-3 py-1 font-medium text-yt-text hover:bg-yt-hover">{primaryActress.name}</Link>}
              {video.work && (
                <Link href={`/${video.work.type === "MOVIE" ? "movie" : "tv-series"}/${video.work.slug}`} className="rounded-full bg-yt-surface2 px-3 py-1 hover:bg-yt-hover">
                  {video.work.title}
                </Link>
              )}
              {video.year && <Link href={`/year/${video.year}`} className="rounded-full bg-yt-surface2 px-3 py-1 hover:bg-yt-hover">{video.year}</Link>}
              {video.durationSeconds > 0 && <span className="rounded-full bg-yt-surface2 px-3 py-1">{formatDuration(video.durationSeconds)}</span>}
            </div>

            <div className="mt-4 rounded-2xl border border-yt-border/70 bg-yt-surface2 p-4">
              <p className="whitespace-pre-line text-sm leading-6 text-yt-text">{video.description}</p>
              {video.tags.some((tag) => isPublicTagSlug(tag.slug)) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {video.tags.filter((tag) => isPublicTagSlug(tag.slug)).map((tag) => (
                    <Link key={tag.id} href={`/tag/${tag.slug}`} className="rounded-full border border-yt-border px-3 py-1 text-xs font-medium text-yt-text2 hover:bg-yt-hover hover:text-yt-text">
                      #{tag.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </article>

        {adProviderUrl && hasDesktopRail && (
          <aside className="hidden min-w-0 xl:block">
            <div className="sticky top-20 space-y-4">
              {desktopTopAdZone && (
                <div className="min-h-[286px] overflow-hidden rounded-2xl border border-yt-border/70 bg-yt-surface2 px-2 py-4">
                  <NeverBlockDisplayZone zoneId={desktopTopAdZone} providerUrl={adProviderUrl} keywords={adKeywords} mediaQuery="(min-width: 1280px)" zoneClassName="eas6a97888e2" />
                </div>
              )}
              {desktopBottomAdZone && (
                <div className="min-h-[536px] overflow-hidden rounded-2xl border border-yt-border/70 bg-yt-surface2 px-2 py-4">
                  <NeverBlockDisplayZone zoneId={desktopBottomAdZone} providerUrl={adProviderUrl} keywords={adKeywords} mediaQuery="(min-width: 1280px)" zoneClassName="eas6a97888e2" />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <RelatedVideosLoadMore key={video.id} video={video} nativeZoneIds={process.env.EXOCLICK_RELATED_NATIVE_ZONE_IDS} />
    </PublicShell>
  );
}
