"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Pause,
  Play,
  Share2,
  VolumeX,
  Volume2,
} from "lucide-react";
import { Avatar } from "../basics";
import { useYT } from "@/store/youtube-store";
import { SHORTS, channelById, type ShortVideo } from "@/lib/youtube/data";

function ShortItem({
  short,
  muted,
  setMuted,
  onShare,
}: {
  short: ShortVideo;
  muted: boolean;
  setMuted: (m: boolean) => void;
  onShare: () => void;
}) {
  const navigate = useYT((s) => s.navigate);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const ch = channelById(short.channelId);

  /* play when visible, pause when out of view */
  useEffect(() => {
    const el = containerRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          v.play().then(() => setPlaying(true)).catch(() => {});
        } else {
          v.pause();
          setPlaying(false);
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center px-2 py-1"
    >
      <div className="relative h-full max-h-[calc(100vh-72px)] aspect-[9/16] max-w-full overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          src={short.videoUrl}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) {
              v.play().then(() => setPlaying(true)).catch(() => {});
            } else {
              v.pause();
              setPlaying(false);
            }
          }}
        />

        {/* center play indicator */}
        {!playing && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-black/50 text-white">
              <Play className="h-8 w-8" fill="currentColor" />
            </span>
          </div>
        )}

        {/* mute toggle */}
        <button
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={() => setMuted(!muted)}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>

        {/* side actions */}
        <div className="absolute bottom-16 right-2 flex flex-col items-center gap-4 text-white sm:right-[-56px] sm:text-yt-text">
          <div className="flex flex-col items-center">
            <button
              onClick={onShare}
              aria-label="Share"
              className="grid h-12 w-12 place-items-center rounded-full bg-black/50 backdrop-blur sm:bg-yt-chip"
            >
              <Share2 className="h-6 w-6" />
            </button>
            <span className="mt-1 text-xs font-medium">Share</span>
          </div>
          <button
            aria-label="More"
            onClick={() => toast("More actions aren't available in this demo")}
            className="grid h-12 w-12 place-items-center rounded-full bg-black/50 backdrop-blur sm:bg-yt-chip"
          >
            <MoreVertical className="h-6 w-6" />
          </button>
        </div>

        {/* bottom info */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 text-white sm:bg-transparent">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate({ type: "channel", channelId: ch.id })}
              className="flex items-center gap-2"
            >
              <Avatar initials={ch.initials} color={ch.color} imgSrc={ch.profileImageUrl} size={32} />
              <span className="text-sm font-medium">{ch.name}</span>
            </button>
          </div>
          <p className="mt-2 line-clamp-2 text-sm">{short.title}</p>
          <p className="mt-1 text-xs text-white/90">Actrezz Short</p>
        </div>
      </div>
    </div>
  );
}

export function ShortsPage({ onShare }: { onShare: () => void }) {
  const muted = useYT((s) => s.shortsMuted);
  const setMuted = useYT((s) => s.setShortsMuted);
  const scroller = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const scrollTo = (i: number) => {
    const target = Math.max(0, Math.min(SHORTS.length - 1, i));
    setIdx(target);
    scroller.current?.scrollTo({ top: target * scroller.current.clientHeight });
  };

  if (SHORTS.length === 0) {
    return (
      <div className="grid h-[calc(100vh-56px)] place-items-center px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-bold text-yt-text">Shorts coming soon</h1>
          <p className="mt-2 text-sm leading-6 text-yt-text2">
            Short videos have not been added yet. Explore the full video catalogue for now.
          </p>
          <button
            onClick={() => useYT.getState().navigate({ type: "home" })}
            className="mt-5 rounded-full bg-yt-text px-5 py-2.5 text-sm font-medium text-yt-bg"
          >
            Browse videos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-56px)]">
      <div
        ref={scroller}
        className="yt-snaps h-full overflow-y-auto no-scrollbar"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIdx(Math.round(el.scrollTop / el.clientHeight));
        }}
      >
        {SHORTS.map((s) => (
          <div key={s.id} className="h-full">
            <ShortItem short={s} muted={muted} setMuted={setMuted} onShare={onShare} />
          </div>
        ))}
      </div>

      {/* up / down navigation */}
      <div className="absolute bottom-16 right-4 hidden flex-col gap-2 md:flex">
        <button
          aria-label="Previous short"
          onClick={() => scrollTo(idx - 1)}
          disabled={idx === 0}
          className="grid h-10 w-10 place-items-center rounded-full bg-yt-chip text-yt-text hover:bg-yt-hover disabled:opacity-40"
        >
          <ChevronUp className="h-6 w-6" />
        </button>
        <button
          aria-label="Next short"
          onClick={() => scrollTo(idx + 1)}
          disabled={idx === SHORTS.length - 1}
          className="grid h-10 w-10 place-items-center rounded-full bg-yt-chip text-yt-text hover:bg-yt-hover disabled:opacity-40"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
