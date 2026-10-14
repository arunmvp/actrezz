"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Observe } from "@reelkit/react";
import { ReelPlayerOverlay, type BaseContentItem } from "@reelkit/react-reel-player";
import "@reelkit/react-reel-player/styles.css";
import { ArrowLeft, ChevronDown, ChevronUp, Pause, Play, RotateCcw, Share2, Volume2, VolumeX } from "lucide-react";
import { ShortsAdSlide } from "@/components/public/ShortsAdSlide";
import type { PublicVideo } from "@/lib/public-catalog";

type ReelShort = BaseContentItem & { video: PublicVideo };

function activeVideo() {
  return document.querySelector<HTMLVideoElement>(".rk-reel-video-element");
}

export function ShortsReelPlayer({ videos, initialIndex, vastUrl }: {
  videos: PublicVideo[];
  initialIndex: number;
  vastUrl?: string;
}) {
  const router = useRouter();
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [adRequested, setAdRequested] = useState(false);
  const [adRun, setAdRun] = useState(0);
  const [adPlaying, setAdPlaying] = useState(false);

  const content = useMemo<ReelShort[]>(() => videos.map((video) => ({
    id: video.id,
    video,
    media: [{
      id: `video-${video.id}`,
      type: "video" as const,
      src: video.videoUrl,
      poster: video.thumbnailUrl,
      aspectRatio: 9 / 16,
    }],
  })), [videos]);

  useEffect(() => {
    if (!vastUrl || adRequested) return;
    const timer = window.setTimeout(() => setAdRequested(true), 60_000);
    return () => window.clearTimeout(timer);
  }, [adRequested, adRun, vastUrl]);

  const close = useCallback(() => {
    router.push("/shorts");
  }, [router]);

  const updateUrl = useCallback((index: number) => {
    const video = videos[index];
    if (!video) return;
    const href = `/shorts/${video.slug}`;
    window.history.replaceState(window.history.state, "", href);
    document.title = `${video.seoTitle || video.title} | Actrezz`;
    setPaused(false);
  }, [videos]);

  function togglePlayback() {
    if (adPlaying) return;
    const video = activeVideo();
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      video.pause();
      setPaused(true);
    }
  }

  async function share(video: PublicVideo) {
    const url = new URL(`/shorts/${video.slug}`, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title: video.title, text: video.description, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      // Share sheets may be dismissed by the visitor.
    }
  }

  return (
    <>
      <ReelPlayerOverlay<ReelShort>
        isOpen
        onClose={close}
        content={content}
        initialIndex={initialIndex}
        ariaLabel="Actrezz Shorts player"
        aspectRatio={9 / 16}
        enableWheel
        enableNavKeys
        loop={false}
        timeline="always"
        transitionDuration={260}
        swipeDistanceFactor={0.1}
        onSlideChange={updateUrl}
        renderSlide={({ defaultContent, isActive }) => (
          <div
            className="relative h-full w-full bg-black"
            onClick={(event) => {
              if (!isActive || (event.target as HTMLElement).closest("button,a,[role='slider']")) return;
              togglePlayback();
            }}
            onDoubleClick={(event) => {
              if (!isActive) return;
              const video = activeVideo();
              if (!video) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + (event.clientX < bounds.left + bounds.width / 2 ? -10 : 10)));
            }}
          >
            {defaultContent}
            {isActive && paused && <span className="pointer-events-none absolute inset-0 z-[8] grid place-items-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-black/55 text-white backdrop-blur"><Play className="ml-1 h-7 w-7 fill-current" /></span></span>}
          </div>
        )}
        renderSlideOverlay={(item, _index, isActive) => isActive ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[7] bg-gradient-to-t from-black/85 via-black/25 to-transparent px-4 pb-[max(3.25rem,calc(env(safe-area-inset-bottom)+2.5rem))] pt-24 text-white sm:pb-8">
            <p className="max-w-[80%] text-sm font-semibold drop-shadow">{item.video.actresses[0]?.name || "Actrezz Short"}</p>
            <h1 className="mt-1 line-clamp-2 max-w-[85%] text-sm leading-5 text-white/95 drop-shadow sm:text-base">{item.video.title}</h1>
          </div>
        ) : null}
        renderControls={({ item, soundState, onClose }) => (
          <>
            <button type="button" onClick={onClose} aria-label="Back to Shorts" className="absolute left-3 top-[max(.75rem,env(safe-area-inset-top))] z-20 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur hover:bg-black/75"><ArrowLeft className="h-6 w-6" /></button>
            <Observe signals={[soundState.muted]}>{() => (
              <button type="button" onClick={() => { const nextMuted = !soundState.muted.value; soundState.toggle(); setMuted(nextMuted); }} aria-label={soundState.muted.value ? "Unmute" : "Mute"} className="absolute right-3 top-[max(.75rem,env(safe-area-inset-top))] z-20 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur hover:bg-black/75">
                {soundState.muted.value ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            )}</Observe>
            <button type="button" onClick={() => void share(item.video)} aria-label="Share short" className="absolute bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4rem))] right-3 z-20 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur hover:bg-black/75 sm:bottom-8"><Share2 className="h-5 w-5" /></button>
            <button type="button" onClick={togglePlayback} aria-label={paused ? "Play" : "Pause"} className="sr-only">{paused ? <Play /> : <Pause />}</button>
          </>
        )}
        renderNavigation={({ activeIndex, count, onPrev, onNext }) => (
          <div className="absolute bottom-6 right-5 z-20 hidden flex-col gap-2 md:flex">
            <button type="button" aria-label="Previous short" disabled={activeIndex === 0} onClick={onPrev} className="grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 disabled:opacity-35"><ChevronUp className="h-6 w-6" /></button>
            <button type="button" aria-label="Next short" disabled={activeIndex >= count - 1} onClick={onNext} className="grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 disabled:opacity-35"><ChevronDown className="h-6 w-6" /></button>
          </div>
        )}
        renderLoading={({ item }) => (
          <div className="pointer-events-none absolute inset-0 z-[6] grid place-items-center overflow-hidden bg-black">
            <img src={item.video.thumbnailUrl} alt={`${item.video.title} short video thumbnail`} className="absolute inset-0 h-full w-full object-cover opacity-75" />
            <span className="absolute inset-0 bg-black/20" />
            <span className="grid h-12 w-12 place-items-center rounded-full bg-black/45 backdrop-blur"><span className="h-6 w-6 animate-spin rounded-full border-2 border-white/25 border-t-white" /></span>
          </div>
        )}
        renderError={() => (
          <div className="absolute inset-0 z-[9] grid place-items-center bg-black/75 p-6 text-center text-white">
            <div><p className="text-sm font-semibold">This Short could not be loaded.</p><button type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"><RotateCcw className="h-4 w-4" /> Retry</button></div>
          </div>
        )}
      />

      {vastUrl && (
        <div className="pointer-events-none fixed inset-0 z-[1200]">
          <ShortsAdSlide
            active={adRequested}
            muted={muted}
            vastUrl={vastUrl}
            onStarted={() => { activeVideo()?.pause(); setAdPlaying(true); }}
            onFinished={() => {
              setAdPlaying(false);
              setAdRequested(false);
              setAdRun((value) => value + 1);
              void activeVideo()?.play().catch(() => {});
            }}
          />
        </div>
      )}
    </>
  );
}
