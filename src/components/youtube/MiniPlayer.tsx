"use client";

import { useEffect, useRef, useState } from "react";
import { X, Maximize2, Pause, Play } from "lucide-react";
import { useYT } from "@/store/youtube-store";
import { VIDEOS } from "@/lib/youtube/data";

/** Floating miniplayer that keeps playing when you navigate away from a video */
export function MiniPlayer() {
  const miniPlayer = useYT((s) => s.miniPlayer);
  const closeMiniPlayer = useYT((s) => s.closeMiniPlayer);
  const openMiniPlayer = useYT((s) => s.openMiniPlayer);
  const navigate = useYT((s) => s.navigate);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  const video = VIDEOS.find((v) => v.id === miniPlayer?.videoId);

  /* sync player with miniplayer state */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !miniPlayer) return;
    if (miniPlayer.time > 0) v.currentTime = miniPlayer.time;
    v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [miniPlayer]);

  if (!miniPlayer || !video) return null;

  const expand = () => {
    const t = videoRef.current?.currentTime ?? 0;
    closeMiniPlayer();
    navigate({ type: "watch", videoId: video.id });
    /* pass time so watch page could resume (player starts fresh in this demo) */
    void t;
  };

  return (
    <div
      className="group fixed bottom-4 right-4 z-40 w-[min(400px,calc(100vw-32px))] overflow-hidden rounded-xl bg-black shadow-2xl"
      role="dialog"
      aria-label="Miniplayer"
    >
      <div className="relative aspect-video w-full bg-black">
        <video
          ref={videoRef}
          src={video.videoUrl}
          muted={false}
          playsInline
          className="h-full w-full object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />

        {/* hover controls overlay */}
        <div className="absolute inset-0 flex items-center justify-between bg-black/0 px-2 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
          <button
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) v.play().catch(() => {});
              else v.pause();
            }}
            className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <div className="flex gap-1">
            <button
              aria-label="Expand"
              onClick={expand}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <Maximize2 className="h-5 w-5" />
            </button>
            <button
              aria-label="Close miniplayer"
              onClick={() => {
                const t = videoRef.current?.currentTime ?? 0;
                closeMiniPlayer();
                openMiniPlayer(miniPlayer.videoId, t); /* keep position stored? no-op */
                useYT.setState({ miniPlayer: null });
              }}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* title bar */}
      <button
        onClick={expand}
        className="flex w-full items-center gap-2 bg-yt-bg px-3 py-2 text-left"
      >
        <span className="line-clamp-1 flex-1 text-sm font-medium text-yt-text">
          {video.title}
        </span>
        <span className="text-xs text-yt-text2">Actrezz</span>
      </button>
    </div>
  );
}
