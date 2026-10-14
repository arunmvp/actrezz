"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, CircleMinus, Music2, Play, RefreshCw, Share2, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import type { PublicVideo } from "@/lib/public-catalog";
import { useYT } from "@/store/youtube-store";
import { ProfileImage } from "./ProfileImage";
import { ShortsAdSlide } from "./ShortsAdSlide";
import { ExoClickDisplayZone } from "@/components/ads/ExoClickDisplayZone";

function ShortSlide({ video, active, nearby, suspended, muted, setMuted, resumeAt, onPlayback, onEnded, onNotInterested }: {
  video: PublicVideo;
  active: boolean;
  nearby: boolean;
  suspended: boolean;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  resumeAt: number;
  onPlayback: (time: number) => void;
  onEnded: () => void;
  onNotInterested: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const loaderTimerRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const restoredRef = useRef(false);
  const primary = video.actresses[0];

  useEffect(() => {
    const player = videoRef.current;
    if (!player) return;
    if (!active || suspended || autoplayBlocked) {
      player.pause();
      return;
    }
    player.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [active, suspended, autoplayBlocked, video.videoUrl]);

  useEffect(() => {
    if (loaderTimerRef.current !== null) window.clearTimeout(loaderTimerRef.current);
    loaderTimerRef.current = null;
    if (active && !ready && !suspended) {
      // Keep the thumbnail visible while a nearby short becomes active. A
      // spinner is useful only when buffering is long enough to be noticed.
      loaderTimerRef.current = window.setTimeout(() => setShowLoader(true), 750);
    }
    return () => {
      if (loaderTimerRef.current !== null) window.clearTimeout(loaderTimerRef.current);
    };
  }, [active, ready, suspended]);

  const markReady = useCallback(() => {
    setReady(true);
    setShowLoader(false);
    if (loaderTimerRef.current !== null) {
      window.clearTimeout(loaderTimerRef.current);
      loaderTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const player = videoRef.current;
    if (!player || !active || restoredRef.current || resumeAt <= 0) return;
    const restore = () => {
      if (player.duration > 0) {
        player.currentTime = Math.min(resumeAt, Math.max(0, player.duration - 0.25));
        restoredRef.current = true;
      }
    };
    player.addEventListener("loadedmetadata", restore, { once: true });
    restore();
    return () => player.removeEventListener("loadedmetadata", restore);
  }, [active, resumeAt, video.id]);

  const retry = () => {
    const player = videoRef.current;
    if (!player) return;
    setMediaError(null);
    setReady(false);
    setShowLoader(true);
    player.load();
    void player.play().catch(() => undefined);
  };

  function togglePlay() {
    if (suspended) return;
    const player = videoRef.current;
    if (!player) return;
    if (player.paused) {
      setAutoplayBlocked(false);
      player.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
    else {
      player.pause();
      setPlaying(false);
    }
  }

  async function shareShort() {
    // Sharing can open a native sheet or a separate app/tab. Do not let the
    // current Short continue in the background and reach the next slide while
    // the visitor is away.
    const player = videoRef.current;
    setAutoplayBlocked(true);
    player?.pause();
    setPlaying(false);
    const url = `${window.location.origin}/shorts/${video.slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: video.title, url });
        return;
      } catch {
        return;
      }
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    toast.success("Short link copied");
  }

  return (
    <section className="shorts-reel-slide grid h-full w-full snap-start place-items-center bg-black sm:bg-yt-bg sm:px-4 sm:py-2">
      <div className="relative flex h-full w-full items-center justify-center sm:w-auto sm:max-w-full">
        <div className="shorts-frame relative h-full w-full overflow-hidden bg-black sm:rounded-2xl sm:shadow-2xl sm:shadow-black/40">
          <img
            src={video.thumbnailUrl}
            alt={`${video.title} short video thumbnail`}
            loading={active ? "eager" : "lazy"}
            fetchPriority={active ? "high" : "low"}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${ready ? "opacity-0" : "opacity-100"}`}
          />
          <video
            ref={videoRef}
            src={nearby ? video.videoUrl : undefined}
            poster={nearby ? video.thumbnailUrl : undefined}
            muted={muted}
            playsInline
            preload={active ? "auto" : nearby ? "metadata" : "none"}
            className="relative z-[1] h-full w-full cursor-pointer object-contain"
            onClick={togglePlay}
            onEnded={onEnded}
            onCanPlay={markReady}
            onLoadedData={markReady}
            onPlaying={markReady}
            onWaiting={() => active && setShowLoader(true)}
            onStalled={() => active && setShowLoader(true)}
            onError={() => {
              setShowLoader(false);
              setMediaError("This Short could not be loaded. Check your connection and retry.");
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) => {
              const player = event.currentTarget;
              setProgress(player.duration > 0 ? player.currentTime / player.duration : 0);
              if (active) onPlayback(player.currentTime);
            }}
          />

          {showLoader && active && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/20" aria-label="Loading short">
              <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            </div>
          )}

          {mediaError && active && (
            <div className="absolute inset-0 z-30 grid place-items-center bg-black/80 px-6 text-center text-white">
              <div><p className="text-sm font-medium">{mediaError}</p><button type="button" onClick={retry} className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"><RefreshCw className="h-4 w-4" /> Retry</button></div>
            </div>
          )}

          {ready && !playing && !suspended && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-black/55 text-white backdrop-blur"><Play className="ml-1 h-8 w-8" fill="currentColor" /></span>
            </div>
          )}

          {active && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/45 to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pl-4 pr-20 pt-28 text-white sm:p-4 sm:pt-24">
            {primary && (
              <div className="flex items-center gap-2">
                <Link href={`/actress/${primary.slug}`} className="pointer-events-auto inline-flex min-w-0 items-center gap-2 rounded-full bg-black/35 pr-3 backdrop-blur hover:bg-black/55">
                  <ProfileImage src={primary.profileImageUrl} alt={`${primary.name} profile image`} initials={primary.initials} color={primary.color} className="h-8 w-8 shrink-0" />
                  <span className="truncate text-sm font-semibold">@{primary.slug}</span>
                </Link>
                <Link href={`/actress/${primary.slug}`} className="pointer-events-auto shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-200">Profile</Link>
              </div>
            )}
            <h1 className="mt-3 line-clamp-2 text-[15px] font-semibold leading-5 sm:text-base">{video.title}</h1>
            <p className="mt-1 flex items-center gap-1 text-xs text-white/85"><Music2 className="h-3.5 w-3.5" /> Original audio</p>
          </div>}

          {active && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[3px] bg-white/20">
            <span className="block h-full bg-white transition-[width] duration-150" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>}
        </div>

        {active && <div className="absolute bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))] right-3 z-20 flex flex-col items-center gap-4 text-white sm:-right-16 sm:bottom-6 sm:text-yt-text">
          <div className="flex flex-col items-center">
            <button type="button" onClick={shareShort} aria-label="Share" className="grid h-12 w-12 place-items-center rounded-full bg-black/55 shadow-lg backdrop-blur hover:bg-black/75 sm:bg-yt-chip sm:hover:bg-yt-hover"><Share2 className="h-6 w-6" /></button>
            <span className="mt-1 text-[11px] font-medium drop-shadow sm:text-xs">Share</span>
          </div>
          <button type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)} className="grid h-12 w-12 place-items-center rounded-full bg-black/55 shadow-lg backdrop-blur hover:bg-black/75 sm:bg-yt-chip sm:hover:bg-yt-hover">
            {muted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
          </button>
          <div className="flex flex-col items-center">
            <button type="button" aria-label="Not interested" title="Not interested" onClick={onNotInterested} className="grid h-10 w-10 place-items-center rounded-full bg-black/55 shadow-lg backdrop-blur hover:bg-black/75 sm:bg-yt-chip sm:hover:bg-yt-hover"><CircleMinus className="h-5 w-5" /></button>
            <span className="mt-1 text-[10px] font-medium drop-shadow sm:text-xs">Hide</span>
          </div>
        </div>}
      </div>
    </section>
  );
}

const resumeKey = "actrezz:shorts:position";

export function PublicShortsReel({ videos, page, shortsVastUrl, shortsBannerZoneIds = [], shortsBannerProviderUrl, initialIndex = 0 }: {
  videos: PublicVideo[];
  page: number;
  shortsVastUrl?: string;
  shortsBannerZoneIds?: string[];
  shortsBannerProviderUrl?: string;
  initialIndex?: number;
}) {
  const router = useRouter();
  const muted = useYT((state) => state.shortsMuted);
  const setMuted = useYT((state) => state.setShortsMuted);
  const hideFromFeed = useYT((state) => state.hideFromFeed);
  const hiddenFromFeed = useYT((state) => state.hiddenFromFeed);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [feed, setFeed] = useState(videos);
  const [nextPage, setNextPage] = useState(Math.max(2, page + 1));
  // The player page receives a focused window around the requested Short,
  // rather than the full catalogue. Probe the next lightweight feed page when
  // the visitor reaches the end so this remains endless as the catalogue grows.
  const [hasMore, setHasMore] = useState(videos.length > 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const safeInitialIndex = Math.max(0, Math.min(feed.length - 1, initialIndex));
  const indexRef = useRef(safeInitialIndex);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollSettleRef = useRef<number | null>(null);
  const [index, setIndex] = useState(safeInitialIndex);
  const [adRequested, setAdRequested] = useState(false);
  const [adPlaying, setAdPlaying] = useState(false);
  const [dismissedBannerIndex, setDismissedBannerIndex] = useState(-1);
  const [pageHidden, setPageHidden] = useState(false);
  const playbackRef = useRef<Record<string, number>>({});
  const lastSavedProgressRef = useRef<Record<string, number>>({});
  const [restoredTimes, setRestoredTimes] = useState<Record<string, number>>({});
  const adClockRef = useRef({ watchedMs: 0, startedAt: 0 });
  const bannerVisible = index > 0 && index % 3 === 0 && dismissedBannerIndex !== index && shortsBannerZoneIds.length > 0 && Boolean(shortsBannerProviderUrl);
  const bannerZoneId = bannerVisible ? shortsBannerZoneIds[Math.floor(index / 3 - 1) % shortsBannerZoneIds.length] : "";

  const accountAdTime = useCallback(() => {
    const clock = adClockRef.current;
    if (clock.startedAt) clock.watchedMs += Math.max(0, Date.now() - clock.startedAt);
    clock.startedAt = 0;
    sessionStorage.setItem("actrezz:shorts:ad-clock", JSON.stringify(clock));
    return clock.watchedMs;
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return 0;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/public/shorts?page=${nextPage}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Shorts feed request failed");
      const result = await response.json() as { items?: PublicVideo[]; totalPages?: number };
      const additions = result.items || [];
      setFeed((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...additions.filter((item) => !ids.has(item.id))];
      });
      setHasMore(nextPage < (result.totalPages || nextPage));
      setNextPage((value) => value + 1);
      return additions.length;
    } catch {
      setHasMore(false);
      return 0;
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextPage]);

  const scrollTo = useCallback((targetIndex: number) => {
    if (targetIndex >= feed.length) {
      void loadMore();
      return;
    }
    const target = Math.max(0, targetIndex);
    indexRef.current = target;
    setIndex(target);
    scrollerRef.current?.scrollTo({ top: target * (scrollerRef.current?.clientHeight || 1), behavior: "smooth" });
  }, [feed.length, loadMore]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    if (scrollSettleRef.current !== null) window.clearTimeout(scrollSettleRef.current);
  }, []);

  useEffect(() => {
    const syncVisibility = () => setPageHidden(document.visibilityState === "hidden");
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (scroller) scroller.scrollTop = safeInitialIndex * scroller.clientHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [safeInitialIndex]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(resumeKey) || sessionStorage.getItem(resumeKey) || "null") as { slug?: string; time?: number } | null;
      const current = feed[safeInitialIndex];
      if (saved?.slug === current?.slug && Number.isFinite(saved.time) && (saved.time || 0) > 0) {
        playbackRef.current[current.id] = saved.time || 0;
        setRestoredTimes({ [current.id]: saved.time || 0 });
      }
    } catch { /* malformed browser storage */ }
  }, [feed, safeInitialIndex]);

  useEffect(() => {
    if (!hiddenFromFeed.length) return;
    setFeed((current) => current.filter((video) => !hiddenFromFeed.includes(video.id)));
  }, [hiddenFromFeed]);

  useEffect(() => {
    const saved = sessionStorage.getItem("actrezz:shorts:ad-clock");
    if (saved) {
      try { adClockRef.current = { ...adClockRef.current, ...JSON.parse(saved) }; } catch { /* malformed browser storage */ }
    }
    const begin = () => {
      if (!document.hidden && !adPlaying && !adClockRef.current.startedAt) adClockRef.current.startedAt = Date.now();
    };
    const pause = () => { accountAdTime(); };
    begin();
    const visibility = () => document.hidden ? pause() : begin();
    document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(() => {
      if (accountAdTime() >= 60_000) setAdRequested(true);
      begin();
    }, 1_000);
    return () => { pause(); document.removeEventListener("visibilitychange", visibility); window.clearInterval(timer); };
  }, [accountAdTime, adPlaying]);

  useEffect(() => {
    const current = feed[index];
    if (!current) return;
    const href = `/shorts/${current.slug}`;
    if (window.location.pathname !== href) window.history.replaceState(window.history.state, "", href);
    document.title = `${current.seoTitle || current.title} | Actrezz`;
    const position = JSON.stringify({ slug: current.slug, index, time: playbackRef.current[current.id] || 0 });
    sessionStorage.setItem(resumeKey, position);
    localStorage.setItem(resumeKey, position);
    if (index >= feed.length - 3) void loadMore();
  }, [feed, index, loadMore]);

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  function markNotInterested() {
    const current = feed[index];
    if (!current) return;
    hideFromFeed(current.id);
    const nextIndex = index < feed.length - 1 ? index : Math.max(0, index - 1);
    if (feed.length <= 1) {
      router.push("/shorts");
      return;
    }
    indexRef.current = nextIndex;
    setIndex(nextIndex);
    setFeed((items) => items.filter((video) => video.id !== current.id));
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (scroller) scroller.scrollTo({ top: nextIndex * scroller.clientHeight, behavior: "smooth" });
    });
  }

  async function showNewPicks() {
    if (loadingMore || !hasMore) return;
    const firstNewIndex = feed.length;
    const added = await loadMore();
    if (!added) return;
    // New Shorts were appended by loadMore. Jump to the first unseen one;
    // existing slides never get reordered beneath the viewer.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      indexRef.current = firstNewIndex;
      setIndex(firstNewIndex);
      scroller.scrollTo({ top: firstNewIndex * scroller.clientHeight, behavior: "smooth" });
    }));
  }

  return (
    <div data-popunder-exclude="true" className="fixed inset-0 z-[1000] h-dvh overflow-hidden bg-black sm:top-14 sm:h-[calc(100dvh-56px)] sm:bg-yt-bg">
      <div ref={scrollerRef} className="yt-snaps no-scrollbar h-full touch-pan-y overscroll-y-contain overflow-y-auto" onScroll={(event) => {
        const element = event.currentTarget;
        if (scrollFrameRef.current !== null) return;
        scrollFrameRef.current = window.requestAnimationFrame(() => {
          scrollFrameRef.current = null;
          if (scrollSettleRef.current !== null) window.clearTimeout(scrollSettleRef.current);
          scrollSettleRef.current = window.setTimeout(() => {
            scrollSettleRef.current = null;
            const nextIndex = Math.max(0, Math.min(feed.length - 1, Math.round(element.scrollTop / Math.max(1, element.clientHeight))));
            if (nextIndex !== indexRef.current) {
              indexRef.current = nextIndex;
              setIndex(nextIndex);
            }
          }, 120);
        });
      }}>
        {feed.map((video, videoIndex) => (
          <ShortSlide
            key={video.id}
            video={video}
            active={index === videoIndex}
            nearby={videoIndex >= index ? videoIndex - index <= 2 : index - videoIndex <= 1}
            suspended={adPlaying || pageHidden}
            muted={muted}
            setMuted={setMuted}
            resumeAt={restoredTimes[video.id] || playbackRef.current[video.id] || 0}
            onPlayback={(time) => {
              playbackRef.current[video.id] = time;
              // Save at most once every two seconds. This gives an accurate
              // Continue action without turning video playback into a stream
              // of storage writes or database requests.
              if (videoIndex === indexRef.current && Math.abs(time - (lastSavedProgressRef.current[video.id] || 0)) >= 2) {
                lastSavedProgressRef.current[video.id] = time;
                const position = JSON.stringify({ slug: video.slug, index: videoIndex, time });
                sessionStorage.setItem(resumeKey, position);
                localStorage.setItem(resumeKey, position);
              }
            }}
            onEnded={() => scrollTo(videoIndex + 1)}
            onNotInterested={markNotInterested}
          />
        ))}
      </div>

      {/* Keep the ad container available after the initial page has become
          interactive. This lets mobile browsers initialise IMA during the
          visitor's next swipe/tap. The VAST request itself remains strictly
          time-based and does not run until the 60-second break is due. */}
      {shortsVastUrl && (
        <div className="pointer-events-none absolute inset-0 z-40">
          <ShortsAdSlide
            active={adRequested}
            muted={muted}
            vastUrl={shortsVastUrl}
            onStarted={() => setAdPlaying(true)}
            onFinished={() => {
              setAdPlaying(false);
              setAdRequested(false);
              adClockRef.current = { watchedMs: 0, startedAt: document.hidden ? 0 : Date.now() };
              sessionStorage.setItem("actrezz:shorts:ad-clock", JSON.stringify(adClockRef.current));
            }}
          />
        </div>
      )}

      {/* A small in-frame unit after every three completed swipes. The VAST
          break remains time-based (one minute), so neither format interrupts
          the first Short or replaces the other. */}
      {bannerVisible && bannerZoneId && (
        <aside aria-label="Advertisement" className="pointer-events-auto absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[35] -translate-x-1/2">
          <div className="shorts-reel-banner relative">
            <span className="absolute left-2 top-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">Ad</span>
            <button type="button" aria-label="Close advertisement" onClick={() => setDismissedBannerIndex(index)} className="absolute right-1 top-1 z-20 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white hover:bg-black"><X className="h-3.5 w-3.5" /></button>
            <ExoClickDisplayZone zoneId={bannerZoneId} providerUrl={shortsBannerProviderUrl!} zoneClassName="eas6a97888e20" className="h-full" showLabel={false} />
          </div>
        </aside>
      )}

      <button type="button" aria-label="Back" title="Back" onClick={goBack} className="absolute left-3 top-[max(.75rem,env(safe-area-inset-top))] z-50 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur hover:bg-black/75"><ArrowLeft className="h-6 w-6" /></button>
      <button type="button" aria-label="Show new Shorts" title="Show new Shorts" onClick={() => void showNewPicks()} disabled={loadingMore || !hasMore} className="absolute right-3 top-[max(.75rem,env(safe-area-inset-top))] z-50 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur hover:bg-black/75 disabled:opacity-50"><RefreshCw className="h-5 w-5" /></button>

      <div className="absolute bottom-6 right-4 z-30 hidden flex-col gap-2 md:flex">
        <button type="button" aria-label="Previous short" disabled={index === 0} onClick={() => scrollTo(index - 1)} className="grid h-10 w-10 place-items-center rounded-full bg-yt-chip text-yt-text shadow-lg hover:bg-yt-hover disabled:opacity-40"><ChevronUp className="h-6 w-6" /></button>
        <button type="button" aria-label="Next short" disabled={index >= feed.length - 1 && !hasMore} onClick={() => scrollTo(index + 1)} className="grid h-10 w-10 place-items-center rounded-full bg-yt-chip text-yt-text shadow-lg hover:bg-yt-hover disabled:opacity-40"><ChevronDown className="h-6 w-6" /></button>
      </div>

    </div>
  );
}
