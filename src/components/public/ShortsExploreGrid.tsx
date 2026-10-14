"use client";

import { LoaderCircle, Play, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { PublicVideo } from "@/lib/public-catalog";
import { useYT } from "@/store/youtube-store";
import { formatDuration } from "@/lib/youtube/format";

type ShortsPage = { items?: PublicVideo[]; totalPages?: number };
type SavedGridState = {
  scrollY: number;
  loadedThroughPage: number;
  orderedIds: string[];
};

const gridStateKey = "actrezz:shorts:grid-state";
const resumeKey = "actrezz:shorts:position";

type ResumePosition = { slug: string; time: number };

const shortPageRequests = new Map<number, Promise<ShortsPage>>();

async function fetchShortsPage(page: number): Promise<ShortsPage> {
  // Coalesce a prefetch and the visitor's button click into one browser
  // request. The route itself remains edge-cached for a new session.
  const existing = shortPageRequests.get(page);
  if (existing) return existing;
  const request = fetch(`/api/public/shorts?page=${page}`, { cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Could not load more Shorties");
      return response.json() as Promise<ShortsPage>;
    })
    .catch((error) => {
      shortPageRequests.delete(page);
      throw error;
    });
  shortPageRequests.set(page, request);
  if (shortPageRequests.size > 16) {
    const oldest = shortPageRequests.keys().next().value;
    if (oldest !== undefined && oldest !== page) shortPageRequests.delete(oldest);
  }
  return request;
}

function mergeVideos(current: PublicVideo[], additions: PublicVideo[]) {
  const knownIds = new Set(current.map((video) => video.id));
  return [...current, ...additions.filter((video) => !knownIds.has(video.id))];
}

export function ShortsExploreGrid({
  videos,
  initialPage,
  initialTotalPages,
}: {
  videos: PublicVideo[];
  initialPage: number;
  initialTotalPages: number;
}) {
  const hiddenFromFeed = useYT((state) => state.hiddenFromFeed);
  const [orderedVideos, setOrderedVideos] = useState(videos);
  const [nextPage, setNextPage] = useState(initialPage + 1);
  const [hasMore, setHasMore] = useState(initialPage < initialTotalPages);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [resumePosition, setResumePosition] = useState<ResumePosition | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(resumeKey) || "null") as Partial<ResumePosition> | null;
      if (saved?.slug && Number.isFinite(saved.time) && Number(saved.time) > 0) {
        const savedSlug = saved.slug;
        const savedTime = Number(saved.time);
        // Defer the optional resume chip until after the feed's first paint.
        // This avoids a synchronous state cascade during hydration.
        const timer = window.setTimeout(() => {
          setResumePosition({ slug: savedSlug, time: savedTime });
        }, 0);
        return () => window.clearTimeout(timer);
      }
    } catch { /* malformed browser storage */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      setOrderedVideos(videos);
      setNextPage(initialPage + 1);
      setHasMore(initialPage < initialTotalPages);
      setLoadError(false);
      let saved: SavedGridState | null = null;
      try {
        const parsed = JSON.parse(sessionStorage.getItem(gridStateKey) || "null") as Partial<SavedGridState> | null;
        if (parsed && Number.isFinite(parsed.scrollY) && Array.isArray(parsed.orderedIds)) {
          saved = {
            scrollY: Math.max(0, Number(parsed.scrollY) || 0),
            loadedThroughPage: Math.max(initialPage, Math.min(initialTotalPages, Number(parsed.loadedThroughPage) || initialPage)),
            orderedIds: parsed.orderedIds.filter((id): id is string => typeof id === "string"),
          };
        }
      } catch { /* malformed browser storage */ }
      if (!saved) return;

      setRestoring(true);
      try {
        const requestedPages = Array.from({ length: saved.loadedThroughPage - initialPage }, (_, index) => initialPage + index + 1);
        // Restore only the batches the visitor had actually opened. Small
        // groups keep return navigation quick without sending 100+ requests.
        const restoredPages: ShortsPage[] = [];
        for (let index = 0; index < requestedPages.length; index += 3) {
          const group = await Promise.all(requestedPages.slice(index, index + 3).map(fetchShortsPage));
          restoredPages.push(...group);
          if (cancelled) return;
        }
        let restoredVideos = restoredPages.reduce((current, result) => mergeVideos(current, result.items || []), videos);
        const videoById = new Map(restoredVideos.map((video) => [video.id, video]));
        const preservedOrder = saved.orderedIds.flatMap((id) => {
          const video = videoById.get(id);
          if (!video) return [];
          videoById.delete(id);
          return [video];
        });
        restoredVideos = [...preservedOrder, ...videoById.values()];
        const lastPage = restoredPages.at(-1);
        if (cancelled) return;
        setOrderedVideos(restoredVideos);
        setNextPage(saved.loadedThroughPage + 1);
        setHasMore(saved.loadedThroughPage < (lastPage?.totalPages || initialTotalPages));
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved.scrollY)));
      } catch {
        // The initial page is already usable; a failed restoration must never
        // trap the visitor behind a loading state.
      } finally {
        if (!cancelled) {
          setRestoring(false);
          sessionStorage.removeItem(gridStateKey);
        }
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, [videos, initialPage, initialTotalPages]);

  useEffect(() => {
    if (!hasMore || restoring) return;
    // Warm exactly one unseen batch only after the first grid has had time to
    // paint. Load more then feels immediate without front-loading media work.
    const timer = window.setTimeout(() => {
      void fetchShortsPage(nextPage).catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [hasMore, nextPage, restoring]);

  async function showNewPicks() {
    if (restoring || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadError(false);
    try {
      // This is intentionally not a client-side shuffle. It asks the feed for
      // the next unseen batch, then puts those new cards first so the action
      // has an immediate, useful result without duplicating a Short.
      const result = await fetchShortsPage(nextPage);
      const additions = result.items || [];
      setOrderedVideos((current) => {
        const knownIds = new Set(current.map((video) => video.id));
        return [...additions.filter((video) => !knownIds.has(video.id)), ...current];
      });
      setHasMore(nextPage < (result.totalPages || nextPage));
      setNextPage((page) => page + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMore() {
    if (restoring || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadError(false);
    try {
      const result = await fetchShortsPage(nextPage);
      const additions = result.items || [];
      setOrderedVideos((current) => mergeVideos(current, additions));
      setHasMore(nextPage < (result.totalPages || nextPage));
      setNextPage((page) => page + 1);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function rememberGridState() {
    const state: SavedGridState = {
      scrollY: window.scrollY,
      loadedThroughPage: Math.max(initialPage, nextPage - 1),
      orderedIds: orderedVideos.map((video) => video.id),
    };
    sessionStorage.setItem(gridStateKey, JSON.stringify(state));
  }

  const visibleVideos = orderedVideos
    .filter((video) => !hiddenFromFeed.includes(video.id));

  return (
    <section aria-label="Shorties feed">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {resumePosition && <a href={`/shorts/${resumePosition.slug}`} onClick={rememberGridState} className="inline-flex items-center rounded-full border border-yt-border bg-yt-surface2 px-3 py-2 text-sm font-medium text-yt-text transition hover:bg-yt-hover hover:text-white">Continue · {formatDuration(resumePosition.time)}</a>}
          <button type="button" onClick={showNewPicks} disabled={loadingMore || restoring || !hasMore} className="inline-flex items-center gap-2 rounded-full border border-yt-border bg-yt-surface2 px-3 py-2 text-sm font-medium text-yt-text transition hover:bg-yt-hover hover:text-white disabled:cursor-wait disabled:opacity-60"><RefreshCw className="h-4 w-4" /> New picks</button>
        </div>
      </div>
      <div className="-mx-3 grid grid-cols-3 gap-px sm:-mx-4 sm:grid-cols-4 lg:-mx-6 lg:grid-cols-6 xl:-mx-8 xl:grid-cols-7 2xl:grid-cols-8">
      {visibleVideos.map((video, index) => (
        <a
          key={video.id}
          href={`/shorts/${video.slug}`}
          target="_self"
          onClick={rememberGridState}
          aria-label={`Watch ${video.title}`}
          className="actrezz-popunder-trigger group relative aspect-[9/16] min-w-0 overflow-hidden bg-yt-skeleton focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ff2d78]"
        >
          <img
            src={video.thumbnailUrl}
            alt={`${video.title} short video thumbnail`}
            // Only the first two cards can be visible during the initial
            // mobile paint. Fetching six original-size short posters at once
            // was competing with the app bundle and delayed the first usable
            // interaction on slower networks.
            loading={index < 2 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : "auto"}
            decoding="async"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.035] group-hover:brightness-75"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-70 transition-opacity group-hover:opacity-100" />
          <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur"><Play className="ml-0.5 h-5 w-5 fill-current" /></span>
          </span>
          <span className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 text-white">
            <span className="line-clamp-2 min-w-0 text-[11px] font-medium leading-4 drop-shadow sm:text-xs">{video.title}</span>
            {video.durationSeconds > 0 && <span className="shrink-0 rounded bg-black/75 px-1 py-0.5 text-[10px] font-medium">{formatDuration(video.durationSeconds)}</span>}
          </span>
        </a>
      ))}
      </div>
      {!visibleVideos.length && !loadingMore && (
        <div className="mx-auto grid min-h-36 max-w-md place-items-center px-5 text-center text-sm text-yt-text2">
          <p>No Shorts are available in this feed yet.</p>
        </div>
      )}
      {(hasMore || loadError || restoring) && (
        <div className="flex justify-center py-7">
          <button type="button" onClick={loadMore} disabled={loadingMore || restoring} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-full border border-yt-border bg-yt-surface2 px-5 py-2.5 text-sm font-semibold text-yt-text transition hover:bg-yt-hover hover:text-white disabled:cursor-wait disabled:opacity-70">
            {loadingMore || restoring ? <><LoaderCircle className="h-4 w-4 animate-spin" /> {restoring ? "Restoring" : "Loading"}</> : loadError ? "Try again" : "Load more"}
          </button>
        </div>
      )}
      {!hasMore && !loadError && !restoring && orderedVideos.length > 0 && (
        <div className="mx-auto my-7 max-w-md rounded-2xl border border-yt-border bg-yt-surface px-5 py-4 text-center">
          <p className="text-sm font-semibold text-yt-text">You&apos;re up to date</p>
          <p className="mt-1 text-xs leading-5 text-yt-text2">No repeats are added. Fresh Shorts will appear here when the next batch is published.</p>
        </div>
      )}
    </section>
  );
}
