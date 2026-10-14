import Link from "next/link";
import { ChevronRight, Play, Sparkles } from "lucide-react";
import type { PublicVideo } from "@/lib/public-catalog";
import { formatDuration } from "@/lib/youtube/format";

function shortText(video: PublicVideo) {
  return [video.title, video.description, ...video.tags.map((tag) => tag.name)].join(" ").toLowerCase();
}

function rotationValue(video: PublicVideo, lane: string) {
  // A stable daily rotation keeps the cache effective while preventing the
  // same rails from looking frozen day after day.
  const day = new Date().toISOString().slice(0, 10);
  const input = `${lane}:${day}:${video.id}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function shelfScore(video: PublicVideo, lane: string) {
  const metadata = Math.min(video.tags.length, 6) * 6 + Math.min(video.description.length, 180) / 30;
  const popularity = Math.log10(Math.max(1, video.viewCount) + 10) * 100;
  // The tiny daily tie-breaker rotates similarly good candidates without
  // allowing one low-quality record to jump ahead of the full rail.
  return popularity + metadata + (rotationValue(video, lane) % 10) / 10;
}

function chooseShelfVideos(videos: PublicVideo[], lane: string, limit: number) {
  return [...videos]
    .sort((left, right) => shelfScore(right, lane) - shelfScore(left, lane) || rotationValue(left, lane) - rotationValue(right, lane))
    .slice(0, limit);
}

/**
 * The Home rail is intentionally curated from the collected metadata instead
 * of being a second copy of the generic latest rail. Keep the display label
 * neutral; the tag is merely a server-side selection rule.
 */
export function selectHomeShorties(videos: PublicVideo[], limit = 9) {
  const featured = videos.filter((video) => /\bbabes?\b/i.test(shortText(video)));
  const selected = chooseShelfVideos(featured, "home-featured", limit);
  if (selected.length >= limit) return selected;
  const selectedIds = new Set(selected.map((video) => video.id));
  return [...selected, ...chooseShelfVideos(videos.filter((video) => !selectedIds.has(video.id)), "home", limit - selected.length)];
}

export function selectTrendingShorties(videos: PublicVideo[], excludedIds: Set<string>, limit = 9) {
  return chooseShelfVideos(videos.filter((video) => !excludedIds.has(video.id)), "trending", limit);
}

/** Compact, ad-free discovery rail for Home and Trending. */
export function ShortiesShelf({ videos, title = "Shorties" }: { videos: PublicVideo[]; title?: string }) {
  const shorties = videos.slice(0, 9);
  if (!shorties.length) return null;

  return (
    <section aria-labelledby="shorties-shelf-title" className="mt-12 border-t border-yt-border/70 pt-7">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#ff2d78]/15 text-[#ff5b95]"><Sparkles className="h-4 w-4" /></span>
          <div><h2 id="shorties-shelf-title" className="text-xl font-bold text-yt-text">{title}</h2><p className="text-xs text-yt-text2">Curated clips in a swipe-ready format</p></div>
        </div>
        <Link href="/shorts" className="flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1.5 text-sm font-medium text-yt-text hover:bg-yt-hover hover:text-yt-text">See all <ChevronRight className="h-4 w-4" /></Link>
      </div>
      <div className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
        {shorties.map((video) => (
            <Link key={video.id} href={`/shorts/${video.slug}`} className="actrezz-popunder-trigger group w-[calc((100vw-48px)/3)] shrink-0 snap-start sm:w-40 md:w-44" aria-label={`Watch ${video.title}`}>
              <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-yt-skeleton shadow-sm ring-1 ring-white/5">
                <img src={video.thumbnailUrl} alt={`${video.title} short video thumbnail`} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.035] group-hover:brightness-75" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur"><Play className="ml-0.5 h-3.5 w-3.5 fill-current" /></span>
                {video.durationSeconds > 0 && <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1 py-0.5 text-[10px] font-medium text-white">{formatDuration(video.durationSeconds)}</span>}
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-yt-text group-hover:text-yt-text">{video.title}</p>
            </Link>
        ))}
      </div>
    </section>
  );
}
