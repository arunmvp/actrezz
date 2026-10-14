"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  RectangleHorizontal,
  Settings,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  PictureInPicture2,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useYT } from "@/store/youtube-store";
import { formatDuration } from "@/lib/youtube/format";
import { cn } from "@/lib/utils";
import { VastAdLayer, type VastAdLayerHandle } from "./VastAdLayer";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function VideoPlayer({
  videoId,
  title = "Video",
  slug,
  src,
  poster,
  durationSec,
  inStreamVastUrl,
  pauseDesktopVastUrl,
  pauseMobileVastUrl,
  autoStart = false,
  theater,
  onToggleTheater,
  onEnded,
  onNext,
}: {
  videoId: string;
  title?: string;
  slug?: string;
  src: string;
  poster?: string;
  durationSec?: number;
  inStreamVastUrl?: string;
  pauseDesktopVastUrl?: string;
  pauseMobileVastUrl?: string;
  /** Used only by the explicit up-next route; starts muted for browser policy. */
  autoStart?: boolean;
  theater: boolean;
  onToggleTheater: () => void;
  onEnded: () => void;
  /** Manual next requests can advance immediately; natural ending uses onEnded. */
  onNext?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlaying = useRef(false);
  const lastSavedAt = useRef(0);
  const restoredProgress = useRef(false);
  const pendingSeekTime = useRef<number | null>(null);
  const vastAdsRef = useRef<VastAdLayerHandle>(null);
  const firstPlaybackRequestedRef = useRef(false);
  const pointerTypeRef = useRef("");
  const lastTouchTapRef = useRef<{ at: number; x: number } | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressPauseAdUntilRef = useRef(0);

  const autoplay = useYT((s) => s.autoplay);
  const setAutoplay = useYT((s) => s.setAutoplay);
  const recordWatch = useYT((s) => s.recordWatch);
  const openMiniPlayer = useYT((s) => s.openMiniPlayer);
  const savedProgress = useYT((s) => s.watchProgress[videoId]);
  const [progressHydrated, setProgressHydrated] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(Number.isFinite(durationSec ?? 0) ? durationSec ?? 0 : 0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(autoStart);
  const [speed, setSpeed] = useState(1);
  const [sourceHeight, setSourceHeight] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState<"root" | "speed">("root");
  const [fullscreen, setFullscreen] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [linearAdActive, setLinearAdActive] = useState(false);
  const [seekIndicator, setSeekIndicator] = useState<"back" | "forward" | null>(null);

  // The persisted watch position is restored after the server-rendered player
  // mounts. Wait for Zustand hydration so a fast metadata event cannot lock in
  // the empty, pre-hydration value.
  useEffect(() => {
    const markHydrated = () => setProgressHydrated(true);
    if (useYT.persist.hasHydrated()) markHydrated();
    const unsubscribe = useYT.persist.onFinishHydration(markHydrated);
    return unsubscribe;
  }, []);

  /* ---------------- progress helpers ---------------- */

  const effectiveDuration = duration > 0 ? duration : Number.isFinite(durationSec ?? 0) ? durationSec ?? 0 : 0;
  const progressPct = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const bufferedPct = effectiveDuration > 0 ? Math.min(100, (buffered / effectiveDuration) * 100) : 0;

  const updateControlsTimeout = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setControlsVisible(true);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !showSettings) {
        setControlsVisible(false);
      }
    }, 3000);
  }, [showSettings]);

  /* ---------------- core actions ---------------- */

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || vastAdsRef.current?.isLinearAdActive()) return;
    if (v.paused) {
      firstPlaybackRequestedRef.current = true;
      vastAdsRef.current?.dismissPauseAd();
      if (vastAdsRef.current?.playPreroll()) {
        setWaiting(true);
        updateControlsTimeout();
        return;
      }
      v.play().catch(() => {
        // Keep the play affordance available when a browser rejects playback.
        setWaiting(false);
        setPlaying(false);
        setControlsVisible(true);
      });
    } else {
      v.pause();
    }
    updateControlsTimeout();
  }, [updateControlsTimeout]);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v || !isFinite(t)) return;
    const mediaDuration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    const knownDuration = Number.isFinite(durationSec ?? 0) && (durationSec ?? 0) > 0 ? durationSec ?? 0 : 0;
    const maxDuration = mediaDuration || knownDuration;
    const target = Math.max(0, Math.min(t, maxDuration || t));
    // Seeking can temporarily pause the media element on Safari/Chromium.
    // That is transport behavior, not a visitor explicitly pausing playback.
    suppressPauseAdUntilRef.current = Date.now() + 1500;
    vastAdsRef.current?.dismissPauseAd();
    pendingSeekTime.current = target;
    if (v.readyState < 1) { setCurrentTime(target); return; }
    try {
      v.currentTime = target;
      pendingSeekTime.current = null;
    } catch {
      /* Some browsers reject seeks before metadata is ready; retry on metadata. */
    }
    setCurrentTime(target);
  }, [durationSec]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      const nativeVideo = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => nativeVideo?.webkitEnterFullscreen?.());
      else nativeVideo?.webkitEnterFullscreen?.();
    }
  }, []);

  const togglePictureInPicture = useCallback(() => {
    const v = videoRef.current;
    if (!v || !("pictureInPictureEnabled" in document)) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else if (!v.disablePictureInPicture) {
      v.requestPictureInPicture().catch(() => {});
    }
  }, []);

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current;
    const nv = Math.max(0, Math.min(1, val));
    if (v) {
      v.volume = nv;
      v.muted = nv === 0;
    }
    setVolume(nv);
    setMuted(nv === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
  }, []);

  /* ---------------- video element events ---------------- */

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const readableDuration = () => {
      const mediaDuration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      const knownDuration = Number.isFinite(durationSec ?? 0) && (durationSec ?? 0) > 0 ? durationSec ?? 0 : 0;
      return mediaDuration || knownDuration;
    };
    const onTime = () => {
      if (!scrubbing) setCurrentTime(v.currentTime);
      const saveDuration = readableDuration();
      if (saveDuration > 0 && Date.now() - lastSavedAt.current >= 5000) {
        lastSavedAt.current = Date.now();
        recordWatch(videoId, v.currentTime / saveDuration);
      }
    };
    const onLoaded = () => {
      const readable = readableDuration();
      setDuration(readable);
      setSourceHeight(v.videoHeight || null);
      setPlaybackError(null);
      if (pendingSeekTime.current != null) {
        const target = pendingSeekTime.current;
        pendingSeekTime.current = null;
        seekTo(target);
        return;
      }
      if (!progressHydrated) return;
      const resumeAt = savedProgress;
      if (!restoredProgress.current && resumeAt && resumeAt > 0.01 && resumeAt < 0.98 && readable > 0) {
        v.currentTime = resumeAt * readable;
        setCurrentTime(v.currentTime);
      }
      restoredProgress.current = true;
    };
    const onPlay = () => {
      setPlaying(true);
      setEnded(false);
      updateControlsTimeout();
    };
    const onPause = () => {
      setPlaying(false);
      setControlsVisible(true);
      const saveDuration = readableDuration();
      if (saveDuration > 0) recordWatch(videoId, v.currentTime / saveDuration);
      // Pause can come from touch, the control button, keyboard, browser media
      // controls, or the OS. Trigger the pause placement from the media event so
      // every input path behaves the same on desktop and mobile.
      if (
        !v.ended &&
        v.currentTime > 0 &&
        Date.now() >= suppressPauseAdUntilRef.current &&
        !vastAdsRef.current?.isLinearAdActive()
      ) {
        vastAdsRef.current?.showPauseAd();
      }
    };
    const onProgress = () => {
      if (v.buffered.length > 0) {
        setBuffered(Math.min(v.buffered.end(v.buffered.length - 1), readableDuration() || v.buffered.end(v.buffered.length - 1)));
      }
    };
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onSeeked = () => { setWaiting(false); if (!scrubbing) setCurrentTime(v.currentTime); };
    const onError = () => {
      setWaiting(false);
      setPlaying(false);
      setPlaybackError("This video could not be loaded. Check the file or try again.");
    };
    const onEndedEv = () => {
      setEnded(true);
      setPlaying(false);
      setControlsVisible(true);
      if (autoplay) onEnded();
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("progress", onProgress);
    v.addEventListener("durationchange", onLoaded);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("error", onError);
    v.addEventListener("ended", onEndedEv);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("canplay", onPlaying);
    if (v.readyState >= 1) onLoaded();
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("progress", onProgress);
      v.removeEventListener("durationchange", onLoaded);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("error", onError);
      v.removeEventListener("ended", onEndedEv);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("canplay", onPlaying);
    };
  }, [autoplay, durationSec, onEnded, progressHydrated, recordWatch, savedProgress, scrubbing, seekTo, updateControlsTimeout, videoId]);

  /* mount: attempt autoplay (allowed after user gesture like a video-card click) */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    queueMicrotask(() => setPipSupported(Boolean(document.pictureInPictureEnabled)));
    if (autoStart) {
      // A timer-driven route transition is no longer a trusted user gesture.
      // Starting muted lets the browser start the next clip while the VAST
      // layer attempts the matching muted preroll first.
      v.muted = true;
      setMuted(true);
      queueMicrotask(togglePlay);
    } else if (!inStreamVastUrl) {
      v.play().catch(() => {
        /* autoplay blocked; user will press play */
      });
    }
  }, [autoStart, inStreamVastUrl, togglePlay]);

  /* fullscreen listener */
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /* native Picture-in-Picture support */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    v.addEventListener("enterpictureinpicture", onEnter);
    v.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      v.removeEventListener("enterpictureinpicture", onEnter);
      v.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || target?.isContentEditable || target?.closest("input, textarea, select, button, a, [role=menu], [role=dialog]")) return;
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "t":
          onToggleTheater();
          break;
        case "i":
          togglePictureInPicture();
          break;
        case "escape":
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else if (theater) {
            onToggleTheater();
          }
          break;
        case "j":
          seekTo(currentTime - 10);
          break;
        case "l":
          seekTo(currentTime + 10);
          break;
        case "n":
          if (e.shiftKey) { e.preventDefault(); (onNext ?? onEnded)(); }
          break;
        case "arrowright":
          e.preventDefault();
          seekTo(currentTime + 5);
          break;
        case "arrowleft":
          e.preventDefault();
          seekTo(currentTime - 5);
          break;
        case "arrowup":
          e.preventDefault();
          changeVolume(volume + 0.1);
          break;
        case "arrowdown":
          e.preventDefault();
          changeVolume(volume - 0.1);
          break;
      }
      updateControlsTimeout();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeVolume, currentTime, onEnded, onNext, onToggleTheater, seekTo, theater, toggleFullscreen, toggleMute, togglePictureInPicture, togglePlay, updateControlsTimeout, volume]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    if (seekIndicatorTimerRef.current) clearTimeout(seekIndicatorTimerRef.current);
  }, []);

  const flashSeekIndicator = useCallback((direction: "back" | "forward") => {
    if (seekIndicatorTimerRef.current) clearTimeout(seekIndicatorTimerRef.current);
    setSeekIndicator(direction);
    seekIndicatorTimerRef.current = setTimeout(() => setSeekIndicator(null), 650);
  }, []);

  const onVideoPointerUp = useCallback((event: React.PointerEvent<HTMLVideoElement>) => {
    pointerTypeRef.current = event.pointerType;
    if (event.pointerType !== "touch" || linearAdActive) return;
    event.preventDefault();

    // The first play/VAST request must happen inside the original user gesture.
    // Delaying it to distinguish a double tap makes mobile browsers reject it.
    if (event.currentTarget.paused && !firstPlaybackRequestedRef.current) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      lastTouchTapRef.current = null;
      togglePlay();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const now = Date.now();
    const previous = lastTouchTapRef.current;
    const isDoubleTap = Boolean(previous && now - previous.at <= 320 && Math.abs(previous.x - x) <= 80);

    if (isDoubleTap) {
      lastTouchTapRef.current = null;
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      const ratio = rect.width > 0 ? x / rect.width : 0.5;
      if (ratio < 0.45) {
        seekTo(currentTime - 10);
        flashSeekIndicator("back");
      } else if (ratio > 0.55) {
        seekTo(currentTime + 10);
        flashSeekIndicator("forward");
      } else {
        togglePlay();
      }
      updateControlsTimeout();
      return;
    }

    lastTouchTapRef.current = { at: now, x };
    singleTapTimerRef.current = setTimeout(() => {
      lastTouchTapRef.current = null;
      togglePlay();
    }, 320);
  }, [currentTime, flashSeekIndicator, linearAdActive, seekTo, togglePlay, updateControlsTimeout]);

  const onVideoClick = useCallback((event: React.MouseEvent<HTMLVideoElement>) => {
    if (pointerTypeRef.current === "touch" || linearAdActive) return;
    if (event.detail >= 2) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      toggleFullscreen();
      return;
    }
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(togglePlay, 220);
  }, [linearAdActive, toggleFullscreen, togglePlay]);

  /* ---------------- progress bar scrubbing ---------------- */

  const barRef = useRef<HTMLDivElement>(null);

  const posToTime = (clientX: number) => {
    const bar = barRef.current;
    if (!bar || effectiveDuration === 0) return 0;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * effectiveDuration;
  };

  const onBarDown = () => {
    suppressPauseAdUntilRef.current = Date.now() + 1500;
    vastAdsRef.current?.dismissPauseAd();
    setScrubbing(true);
    wasPlaying.current = !videoRef.current?.paused;
    videoRef.current?.pause();
    updateControlsTimeout();
  };
  const onBarUp = () => {
    setScrubbing(false);
    setHoverTime(null);
    if (wasPlaying.current) videoRef.current?.play().catch(() => {});
    wasPlaying.current = false;
  };

  const onBarHover = (e: React.MouseEvent) => {
    setHoverTime(posToTime(e.clientX));
  };

  /* ---------------- render ---------------- */

  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.33 ? Volume : volume < 0.66 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      data-popunder-exclude="true"
      data-theater={theater}
      className={cn(
        "group relative w-full overflow-hidden bg-black",
        fullscreen ? "h-screen" : "aspect-video",
        !controlsVisible && playing && "cursor-none"
      )}
      onMouseMove={updateControlsTimeout}
      onMouseLeave={() => playing && !showSettings && setControlsVisible(false)}
      style={{ borderRadius: fullscreen ? 0 : theater ? 0 : undefined }}
    >
      <video
        ref={videoRef}
        src={src}
        aria-label={title}
        title={title}
        className="h-full w-full object-contain"
        playsInline
        muted={muted}
        preload="metadata"
        poster={poster}
        onPointerDown={(event) => { pointerTypeRef.current = event.pointerType; }}
        onPointerUp={onVideoPointerUp}
        onClick={onVideoClick}
      />

      <VastAdLayer
        ref={vastAdsRef}
        playerRef={containerRef}
        videoRef={videoRef}
        inStreamVastUrl={inStreamVastUrl}
        pauseDesktopVastUrl={pauseDesktopVastUrl}
        pauseMobileVastUrl={pauseMobileVastUrl}
        autoPlayPreroll={autoStart}
        onLinearStateChange={(active) => {
          setLinearAdActive(active);
          setWaiting(active);
          if (active) setControlsVisible(false);
        }}
        onResumeContent={() => {
          setWaiting(false);
          videoRef.current?.play().catch(() => {});
        }}
      />

      {seekIndicator && (
        <div className={cn(
          "pointer-events-none absolute inset-y-0 z-20 flex w-1/2 items-center justify-center bg-black/15 text-white",
          seekIndicator === "back" ? "left-0" : "right-0",
        )}>
          <span className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-black/55 text-sm font-semibold">
            {seekIndicator === "back" ? <RotateCcw className="mb-1 h-7 w-7" /> : <RotateCw className="mb-1 h-7 w-7" />}
            10 seconds
          </span>
        </div>
      )}

      {playbackError && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/85 px-6 text-center text-white">
          <div className="max-w-md">
            <p className="text-base font-medium">Video unavailable</p>
            <p className="mt-2 text-sm text-white/70">{playbackError}</p>
            <button type="button" onClick={() => { const video = videoRef.current; if (!video) return; setPlaybackError(null); setWaiting(true); video.load(); video.play().catch(() => setWaiting(false)); }} className="mx-auto mt-4 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black">
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          </div>
        </div>
      )}

      {/* buffering spinner */}
      {waiting && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        </div>
      )}

      {/* center play / replay button */}
      {!playing && !waiting && !linearAdActive && (
        <button
          type="button"
          aria-label={ended ? "Replay" : "Play"}
          title={ended ? "Replay" : "Play"}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            togglePlay();
          }}
          className="absolute inset-0 z-10 grid touch-manipulation place-items-center"
        >
          {ended ? (
            <span className="yt-big-play grid h-16 w-16 place-items-center rounded-full bg-black/60 text-white">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" style={{ transform: "rotate(-90deg)" }}>
                <path d="M12 5V1L7 7l5 6V9a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z" />
              </svg>
            </span>
          ) : (
            <span className="yt-big-play grid h-16 w-16 place-items-center rounded-full bg-black/50 text-white">
              <Play className="h-8 w-8 translate-x-[2px]" fill="currentColor" />
            </span>
          )}
        </button>
      )}

      {/* controls overlay */}
      <div
        className={cn(
          "yt-controls absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-10",
          (!controlsVisible || linearAdActive) && "yt-controls-hidden"
        )}
        onMouseMove={updateControlsTimeout}
      >
        {/* progress bar */}
        <div
          ref={barRef}
          className="group/bar relative mx-2 mb-1 cursor-pointer touch-none py-2"
          onMouseMove={onBarHover}
          onMouseLeave={() => !scrubbing && setHoverTime(null)}
        >
          <input type="range" aria-label="Seek video" aria-valuetext={`${formatDuration(currentTime)} of ${formatDuration(effectiveDuration)}`} min={0} max={effectiveDuration || 1} step={0.1} value={Math.min(currentTime, effectiveDuration || 1)} disabled={!effectiveDuration}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); onBarDown(); }} onPointerUp={onBarUp} onPointerCancel={onBarUp} onLostPointerCapture={() => { if (scrubbing) onBarUp(); }}
            onChange={(event) => seekTo(Number(event.target.value))} onKeyDown={(event) => event.stopPropagation()}
            className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer touch-none opacity-0" />
          <div className="relative h-[3px] w-full rounded-full bg-white/30 transition-[height] group-hover/bar:h-[5px]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/40"
              style={{ width: `${bufferedPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[#f00]"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f00] opacity-0 scale-75 transition-opacity group-hover/bar:opacity-100"
              style={{ left: `${progressPct}%`, opacity: scrubbing ? 1 : undefined }}
            />
          </div>
          {hoverTime != null && (
            <div
              className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white"
              style={{ left: `${effectiveDuration > 0 ? (hoverTime / effectiveDuration) * 100 : 0}%` }}
            >
              {formatDuration(hoverTime)}
            </div>
          )}
        </div>

        {/* buttons row */}
        <div className="player-buttons flex items-center gap-0 px-1 pb-1 text-white sm:gap-1">
          <button
            aria-label={playing ? "Pause (k)" : "Play (k)"}
            title={playing ? "Pause (k)" : "Play (k)"}
            onClick={togglePlay}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10"
          >
            {playing ? (
              <Pause className="h-6 w-6" fill="currentColor" />
            ) : (
              <Play className="h-6 w-6" fill="currentColor" />
            )}
          </button>
          <button
            aria-label="Back 10 seconds"
            title="Back 10 seconds (J)"
            onClick={() => seekTo(currentTime - 10)}
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            aria-label="Forward 10 seconds"
            title="Forward 10 seconds (L)"
            onClick={() => seekTo(currentTime + 10)}
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
          >
            <RotateCw className="h-5 w-5" />
          </button>
          <button
            aria-label="Next (SHIFT+n)"
            title="Next (Shift+N)"
            onClick={onNext ?? onEnded}
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
          >
            <SkipForward className="h-6 w-6" fill="currentColor" />
          </button>

          {/* volume */}
          <div className="group/vol flex items-center">
            <button
              aria-label="Mute (m)"
              title={muted ? "Unmute (M)" : "Mute (M)"}
              onClick={toggleMute}
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
            >
              <VolIcon className="h-6 w-6" fill="currentColor" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
              aria-label="Volume"
              className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/40 opacity-0 transition-all duration-150 group-hover/vol:w-20 group-hover/vol:opacity-100 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              style={{
                background: `linear-gradient(to right, #fff ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,.4) ${(muted ? 0 : volume) * 100}%)`,
              }}
            />
          </div>

          <span className="ml-1 whitespace-nowrap select-none text-[10px] font-medium tabular-nums sm:text-[13px]">
            {formatDuration(currentTime)} / {formatDuration(effectiveDuration)}
          </span>

          <div className="ml-auto flex items-center gap-0.5">
            {/* autoplay toggle */}
            <button
              aria-label="Autoplay"
              title={autoplay ? "Turn autoplay off" : "Turn autoplay on"}
              onClick={() => setAutoplay(!autoplay)}
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
            >
              <span
                className={cn(
                  "relative inline-flex h-3.5 w-7 items-center rounded-full transition-colors",
                  autoplay ? "bg-white" : "bg-white/40"
                )}
              >
                <span
                  className={cn(
                    "absolute h-3 w-3 rounded-full bg-black transition-all",
                    autoplay ? "left-[16px]" : "left-[2px]"
                  )}
                />
              </span>
            </button>

            {/* settings */}
            <DropdownMenu
              open={showSettings}
              onOpenChange={(o) => {
                setShowSettings(o);
                if (!o) setSettingsView("root");
                updateControlsTimeout();
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Settings"
                  title="Settings"
                  className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
                >
                  <Settings className="h-6 w-6" fill="currentColor" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                sideOffset={12}
                className="w-56 border-white/10 bg-black/95 text-white"
              >
                {settingsView === "root" && (
                  <>
                    <DropdownMenuItem
                      className="justify-between gap-6 py-2 text-sm focus:bg-white/10 focus:text-white"
                      onClick={() => setAutoplay(!autoplay)}
                    >
                      Autoplay
                      <span
                        className={cn(
                          "relative inline-flex h-3.5 w-7 items-center rounded-full transition-colors",
                          autoplay ? "bg-white" : "bg-white/40"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute h-3 w-3 rounded-full bg-black transition-all",
                            autoplay ? "left-[16px]" : "left-[2px]"
                          )}
                        />
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white/15" />
                    <DropdownMenuItem
                      className="justify-between gap-6 py-2 text-sm focus:bg-white/10 focus:text-white"
                      onSelect={(event) => { event.preventDefault(); setSettingsView("speed"); }}
                    >
                      Playback speed
                      <span className="text-white/60">{speed === 1 ? "Normal" : `${speed}x`}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled className="justify-between gap-6 py-2 text-sm text-white opacity-100 focus:text-white">
                      Quality
                      <span className="text-white/60">{sourceHeight ? `${sourceHeight}p source` : "Source"}</span>
                    </DropdownMenuItem>
                  </>
                )}
                {settingsView === "speed" && (
                  <>
                    <button
                      className="flex w-full items-center gap-3 border-b border-white/10 px-2 py-2 text-sm text-white"
                      onClick={() => setSettingsView("root")}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 rotate-180" fill="currentColor"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2Z" /></svg>
                      Playback speed
                    </button>
                    {SPEEDS.map((s) => (
                      <DropdownMenuItem
                        key={s}
                        className="justify-between gap-6 py-2 text-sm focus:bg-white/10 focus:text-white"
                        onClick={() => {
                          setSpeed(s);
                          if (videoRef.current) videoRef.current.playbackRate = s;
                          setSettingsView("root");
                        }}
                      >
                        {s === 1 ? "Normal" : s}
                        {speed === s && <Check className="h-4 w-4" />}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {pipSupported ? (
              <button
                aria-label="Picture in picture (i)"
                title={pipActive ? "Exit picture in picture (I)" : "Picture in picture (I)"}
                onClick={togglePictureInPicture}
                className="hidden h-10 w-10 place-items-center rounded-full hover:bg-white/10 sm:grid"
              >
                <PictureInPicture2 className="h-6 w-6" />
              </button>
            ) : (
              <button
                aria-label="Miniplayer (i)"
                title="Miniplayer (I)"
                onClick={() => {
                  const v = videoRef.current;
                  openMiniPlayer(videoId, v ? v.currentTime : 0);
                  useYT.getState().navigate({ type: "home" });
                }}
                className="hidden h-10 w-10 place-items-center rounded-full hover:bg-white/10 sm:grid"
              >
                <PictureInPicture2 className="h-6 w-6" />
              </button>
            )}
            <button
              aria-label="Theater mode (t)"
              title={theater ? "Default view (T)" : "Theater mode (T)"}
              onClick={onToggleTheater}
              className="hidden h-10 w-10 place-items-center rounded-full hover:bg-white/10 md:grid"
            >
              <RectangleHorizontal className="h-6 w-6" />
            </button>
            <button
              aria-label="Fullscreen (f)"
              title={fullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
              onClick={toggleFullscreen}
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
            >
              {fullscreen ? (
                <Minimize className="h-6 w-6" />
              ) : (
                <Maximize className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
