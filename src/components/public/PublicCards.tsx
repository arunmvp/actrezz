import Link from "next/link";
import type { ReactElement } from "react";
import { CalendarDays, Clapperboard, Film, Tags, UsersRound } from "lucide-react";
import type { PublicActress, PublicTag, PublicVideo, PublicWork, PublicYear } from "@/lib/public-catalog";
import { formatDuration } from "@/lib/youtube/format";
import { cn } from "@/lib/utils";
import { ProfileImage } from "./ProfileImage";
import { NativeGridAdCard } from "@/components/ads/NativeGridAdCard";

// Reuse the same native-zone pool and cadence everywhere a catalogue grid is
// shown. A single responsive placement is mounted at each visual slot.
export const CATALOG_NATIVE_DESKTOP_SLOTS = [8, 16, 24];
export const CATALOG_NATIVE_MOBILE_SLOTS = [3, 16, 24];

function responsiveNativeSlots(template: number[], videoCount: number) {
  if (videoCount < 1 || template.length < 1) return [];
  // Keep a native card even for a one-card result, add another at 8 and 16
  // videos, and cap the grid at three sponsored cards. For partial grids the
  // final placement moves directly after the last available video instead of
  // disappearing or leaving several empty ad slots behind.
  const count = Math.min(template.length, 3, Math.floor(videoCount / 8) + 1);
  let previous = 0;
  return template.slice(0, count).map((target, index) => {
    const slot = Math.max(previous + 1, Math.min(target, videoCount + index + 1));
    previous = slot;
    return slot;
  });
}

export function PublicVideoCard({ video, showActress = true, compact = false, relatedLabel, imagePriority = false }: { video: PublicVideo; showActress?: boolean; compact?: boolean; relatedLabel?: string; imagePriority?: boolean }) {
  const primary = video.actresses[0];
  const vertical = video.isShort && !compact;
  return (
    <article className={cn("group flex w-full gap-2", compact ? "flex-row items-start" : "flex-col")}>
      <Link href={video.isShort ? `/shorts/${video.slug}` : `/watch/${video.slug}`} className={cn("actrezz-popunder-trigger relative block shrink-0 overflow-hidden rounded-xl bg-yt-skeleton", compact ? "w-[44%] max-w-[168px] sm:w-44 xl:w-40" : "w-full")}>
        <span className={cn("block w-full", vertical ? "aspect-[9/16]" : "aspect-video")}>
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            loading={imagePriority ? "eager" : "lazy"}
            fetchPriority={imagePriority ? "high" : "low"}
            // The first card is the home page LCP image. Decoding it during
            // the initial paint avoids it waiting behind unrelated card work;
            // every later thumbnail remains off the critical path.
            decoding={imagePriority ? "sync" : "async"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </span>
        {video.durationSeconds > 0 && <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">{formatDuration(video.durationSeconds)}</span>}
        {video.isShort && <span className="absolute left-1 top-1 rounded bg-[#ff2d78] px-1.5 py-0.5 text-[11px] font-semibold uppercase text-white">Short</span>}
      </Link>
      <div className={cn("flex min-w-0 flex-1 gap-2.5", compact && "pt-0.5")}>
        {showActress && primary && !compact && (
          <Link href={`/actress/${primary.slug}`} className="mt-0.5 shrink-0" aria-label={primary.name}>
            <ProfileImage src={primary.profileImageUrl} alt={`${primary.name} profile image`} initials={primary.initials} color={primary.color} className="h-8 w-8" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          {relatedLabel && <p className="mb-1 truncate text-[11px] font-semibold uppercase tracking-wide text-[#ff2d78]">{relatedLabel}</p>}
          <Link href={video.isShort ? `/shorts/${video.slug}` : `/watch/${video.slug}`} className="actrezz-popunder-trigger block">
            <h2 className={cn("line-clamp-2 font-medium text-yt-text group-hover:text-yt-text", compact ? "text-sm leading-[1.25rem]" : "text-[15px] leading-5")}>{video.title}</h2>
          </Link>
          {showActress && primary && <Link href={`/actress/${primary.slug}`} className="mt-0.5 block truncate text-sm text-yt-text2 hover:text-yt-text">{primary.name}</Link>}
        </div>
      </div>
    </article>
  );
}

export function PublicVideoGrid({
  videos,
  showActress = true,
  sponsoredEvery,
  sponsoredDesktopAfter,
  sponsoredMobileAfter,
  relatedLabelFor,
  nativeZoneIds,
}: {
  videos: PublicVideo[];
  showActress?: boolean;
  sponsoredEvery?: number;
  sponsoredDesktopAfter?: number[];
  sponsoredMobileAfter?: number[];
  relatedLabelFor?: (video: PublicVideo) => string | undefined;
  /** Comma-separated page-specific Recommendation Widget zone IDs. */
  nativeZoneIds?: string;
}) {
  const allShorts = videos.length > 0 && videos.every((video) => video.isShort);
  // Zone IDs and provider URLs are public ad-tag configuration, not secrets.
  // Keep known working fallbacks so the catalogue placement is not skipped
  // while a newly deployed Worker secret is propagating.
  const configuredNativeZoneIds = [...new Set((nativeZoneIds || process.env.EXOCLICK_GRID_NATIVE_ZONE_IDS || "6043024,6043026,6043406")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean))];
  const adProviderUrl = process.env.EXOCLICK_AD_PROVIDER_URL || "https://a.magsrv.com/ad-provider.js";
  const requestedDesktopSlots = sponsoredDesktopAfter ?? (sponsoredEvery ? videos.map((_, index) => index + 1).filter((value) => value % sponsoredEvery === 0) : []);
  const requestedMobileSlots = sponsoredMobileAfter ?? requestedDesktopSlots;
  const desktopSlots = responsiveNativeSlots(requestedDesktopSlots, videos.length);
  const mobileSlots = responsiveNativeSlots(requestedMobileSlots, videos.length);
  // Slot numbers include preceding ads: slot 8 means seven videos, then an ad.
  const insertionIndex = (slots: number[], slot: number) => slot - 1 - slots.filter((value) => value < slot).length;
  const adSlots = [...new Set([...desktopSlots, ...mobileSlots])]
    .filter((value) => Number.isInteger(value) && value > 0 && value <= videos.length + Math.max(desktopSlots.length, mobileSlots.length))
    .sort((a, b) => a - b);
  const showSponsoredCards = !allShorts && Boolean(adSlots.length && configuredNativeZoneIds.length && adProviderUrl);

  function sponsoredCard(position: number) {
    if (!showSponsoredCards) return null;
    const desktopVisible = desktopSlots.includes(position);
    const mobileVisible = mobileSlots.includes(position);
    if (!desktopVisible && !mobileVisible) return null;
    const visibleIndex = desktopVisible ? desktopSlots.indexOf(position) : mobileSlots.indexOf(position);
    const zoneId = configuredNativeZoneIds[Math.max(0, visibleIndex) % configuredNativeZoneIds.length];
    const mediaQuery = desktopVisible && mobileVisible
      ? undefined
      : desktopVisible
        ? "(min-width: 768px)"
        : "(max-width: 767px)";
    return (
      <NativeGridAdCard
        key={`sponsored-${position}-${zoneId}-${desktopVisible ? "d" : ""}${mobileVisible ? "m" : ""}`}
        zoneId={zoneId}
        providerUrl={adProviderUrl!}
        mediaQuery={mediaQuery}
        className={cn(
          !desktopVisible && "md:hidden",
          !mobileVisible && "hidden md:block",
        )}
      />
    );
  }

  return (
    <div className={cn(
      "grid gap-x-4 gap-y-7",
      allShorts ? "grid-cols-[repeat(auto-fill,minmax(min(100%,170px),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]"
    )}>
      {(() => {
        const cards: ReactElement[] = [];
        videos.forEach((video, index) => {
          for (const slot of adSlots) {
            if ((desktopSlots.includes(slot) && insertionIndex(desktopSlots, slot) === index)
              || (mobileSlots.includes(slot) && insertionIndex(mobileSlots, slot) === index)) {
              const adCard = sponsoredCard(slot);
              if (adCard) cards.push(adCard);
            }
          }
          // Only one above-the-fold image should compete for the browser's
          // highest network priority. Giving several cards "high" priority
          // delays the actual LCP thumbnail on mobile connections.
          cards.push(<PublicVideoCard key={video.id} video={video} showActress={showActress} relatedLabel={relatedLabelFor?.(video)} imagePriority={index === 0} />);
        });
        // A partial final row can require an ad after the last video. Render
        // only the slots that the responsive rule selected for this grid.
        for (const slot of adSlots) {
          if ((desktopSlots.includes(slot) && insertionIndex(desktopSlots, slot) === videos.length)
            || (mobileSlots.includes(slot) && insertionIndex(mobileSlots, slot) === videos.length)) {
            const adCard = sponsoredCard(slot);
            if (adCard) cards.push(adCard);
          }
        }
        return cards;
      })()}
    </div>
  );
}

export function PublicPagination({ page, totalPages, basePath, query }: { page: number; totalPages: number; basePath: string; query?: Record<string, string | undefined> }) {
  if (totalPages <= 1) return null;
  const href = (value: number) => {
    const params = new URLSearchParams();
    Object.entries(query ?? {}).forEach(([key, val]) => {
      if (val) params.set(key, val);
    });
    if (value > 1) params.set("page", String(value));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const pages = Array.from(new Set([1, page - 1, page, page + 1, totalPages])).filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  return (
    <nav aria-label="Pagination" className="mt-10 flex flex-wrap items-center justify-center gap-1">
      {page > 1 && <Link href={href(page - 1)} className="rounded-full border border-yt-border px-4 py-2 text-sm hover:bg-yt-hover">Prev</Link>}
      {pages.map((value, index) => (
        <span key={value} className="flex items-center gap-1">
          {index > 0 && value - pages[index - 1] > 1 && <span className="px-2 text-yt-text2">…</span>}
          <Link href={href(value)} aria-current={value === page ? "page" : undefined} className={cn("grid h-10 min-w-10 place-items-center rounded-full px-2 text-sm font-medium hover:bg-yt-hover", value === page && "bg-yt-text text-yt-bg hover:bg-yt-text")}>{value}</Link>
        </span>
      ))}
      {page < totalPages && <Link href={href(page + 1)} className="rounded-full border border-yt-border px-4 py-2 text-sm hover:bg-yt-hover">Next</Link>}
    </nav>
  );
}

export function DirectorySearch({ query = "", placeholder }: { query?: string; placeholder: string }) {
  return (
    <form className="mt-4 flex max-w-xl items-center gap-2" action="">
      <input
        aria-label={placeholder}
        name="q"
        defaultValue={query}
        placeholder={placeholder}
        className="h-11 min-w-0 flex-1 rounded-full border border-yt-border bg-yt-search-bg px-4 text-sm text-yt-text outline-none placeholder:text-yt-text2 focus:border-yt-blue"
      />
      <button type="submit" className="h-11 rounded-full bg-yt-text px-5 text-sm font-semibold text-yt-bg hover:opacity-90">Search</button>
      {query && <Link href="?" className="rounded-full px-3 py-2 text-sm text-yt-text2 hover:bg-yt-hover hover:text-yt-text">Clear</Link>}
    </form>
  );
}

export function DirectoryList({ items, kind }: { items: Array<PublicActress | PublicWork | PublicTag | PublicYear>; kind: "actresses" | "movies" | "tv-series" | "tags" | "years" }) {
  const icon = kind === "actresses" ? UsersRound : kind === "movies" ? Film : kind === "tv-series" ? Clapperboard : kind === "tags" ? Tags : CalendarDays;
  const Icon = icon;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => {
        const isActress = "name" in item && "profileImageUrl" in item;
        const isTag = "name" in item && !("profileImageUrl" in item);
        const isYear = "year" in item;
        const label = isYear ? String(item.year) : isTag ? `#${item.name}` : isActress ? item.name : item.title;
        const href = isYear ? `/year/${item.year}` : isTag ? `/tag/${item.slug}` : isActress ? `/actress/${item.slug}` : `/${kind === "movies" ? "movie" : "tv-series"}/${item.slug}`;
        const count = isYear ? item.videoCount : item.videoCount;
        return (
          <Link key={href} href={href} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-yt-border/70 bg-yt-surface2 p-4 transition hover:bg-yt-hover">
            {isActress ? (
              <ProfileImage src={item.profileImageUrl} alt={`${item.name} profile image`} initials={item.initials} color={item.color} className="h-12 w-12" />
            ) : (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/5 text-[#ff2d78]"><Icon className="h-5 w-5" /></span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-yt-text group-hover:text-yt-text">{label}</span>
              <span className="mt-0.5 block text-xs text-yt-text2">{count} videos</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
