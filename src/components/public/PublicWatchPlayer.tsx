"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VideoPlayer } from "@/components/youtube/VideoPlayer";

export function PublicWatchPlayer({
  videoId,
  title,
  src,
  poster,
  durationSec,
  nextHref,
  nextTitle,
  nextThumbnail,
  inStreamVastUrl,
  pauseDesktopVastUrl,
  pauseMobileVastUrl,
}: {
  videoId: string;
  title: string;
  src: string;
  poster?: string;
  durationSec?: number;
  nextHref?: string;
  nextTitle?: string;
  nextThumbnail?: string;
  inStreamVastUrl?: string;
  pauseDesktopVastUrl?: string;
  pauseMobileVastUrl?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [theater, setTheater] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(5);

  const goToNext = useCallback(() => {
    if (nextHref) router.push(`${nextHref}?autoplay=1`);
  }, [nextHref, router]);
  const autoStart = searchParams.get("autoplay") === "1";

  useEffect(() => {
    setShowUpNext(false);
  }, [videoId]);

  useEffect(() => {
    if (!showUpNext || !nextHref) return;
    setSecondsRemaining(5);
    const countdown = window.setInterval(() => {
      setSecondsRemaining((value) => Math.max(0, value - 1));
    }, 1_000);
    const advance = window.setTimeout(goToNext, 5_000);
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(advance);
    };
  }, [goToNext, nextHref, showUpNext]);

  return (
    <div className="relative">
      <VideoPlayer
        key={`${videoId}:${src}`}
        videoId={videoId}
        title={title}
        src={src}
        poster={poster}
        durationSec={durationSec}
        inStreamVastUrl={inStreamVastUrl}
        pauseDesktopVastUrl={pauseDesktopVastUrl}
        pauseMobileVastUrl={pauseMobileVastUrl}
        autoStart={autoStart}
        theater={theater}
        onToggleTheater={() => setTheater((value) => !value)}
        onEnded={() => {
          if (nextHref) setShowUpNext(true);
        }}
        onNext={goToNext}
      />

      {showUpNext && nextHref && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/75 p-5 text-white backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-black/80 p-5 text-center shadow-2xl">
            <p className="text-sm text-white/75">Up next in {secondsRemaining}s</p>
            <div className="mt-3 overflow-hidden rounded-xl bg-black">
              {nextThumbnail && <img src={nextThumbnail} alt="" className="aspect-video h-auto w-full object-cover" />}
            </div>
            <p className="mt-3 line-clamp-2 text-base font-semibold">{nextTitle || "Next video"}</p>
            <div className="mt-5 flex justify-center gap-3">
              <button type="button" onClick={() => setShowUpNext(false)} className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold hover:bg-white/10">Cancel</button>
              <button type="button" onClick={goToNext} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200">Play now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
