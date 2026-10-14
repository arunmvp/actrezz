"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ImaEvent = { getAd?: () => { isLinear?: () => boolean } };
type ImaErrorEvent = { getError?: () => { getMessage?: () => string } };
type ImaAdsRequest = {
  adTagUrl: string;
  linearAdSlotWidth: number;
  linearAdSlotHeight: number;
  nonLinearAdSlotWidth: number;
  nonLinearAdSlotHeight: number;
  setAdWillAutoPlay?: (value: boolean) => void;
  setAdWillPlayMuted?: (value: boolean) => void;
};
type ImaAdsManager = {
  addEventListener: (type: string, listener: (event: ImaEvent) => void) => void;
  destroy: () => void;
  init: (width: number, height: number, viewMode?: unknown) => void;
  resize: (width: number, height: number, viewMode?: unknown) => void;
  setVolume?: (volume: number) => void;
  start: () => void;
};
type ImaAdsLoader = {
  addEventListener: (type: string, listener: (event: ImaEvent | ImaErrorEvent) => void) => void;
  destroy?: () => void;
  requestAds: (request: ImaAdsRequest) => void;
};
type ImaNamespace = {
  AdDisplayContainer: new (container: HTMLElement, contentVideo: HTMLVideoElement) => { initialize: () => void };
  AdsLoader: new (container: { initialize: () => void }) => ImaAdsLoader;
  AdsRequest: new () => ImaAdsRequest;
  AdsRenderingSettings: new () => { restoreCustomPlaybackStateOnAdBreakComplete: boolean };
  AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
  AdErrorEvent: { Type: { AD_ERROR: string } };
  AdEvent: {
    Type: {
      ALL_ADS_COMPLETED: string;
      COMPLETE: string;
      CONTENT_PAUSE_REQUESTED: string;
      CONTENT_RESUME_REQUESTED: string;
      LOADED: string;
      SKIPPED: string;
      STARTED: string;
    };
  };
  ViewMode: { NORMAL: unknown };
};
type ImaLoadedEvent = {
  getAdsManager: (
    video: HTMLVideoElement,
    settings: { restoreCustomPlaybackStateOnAdBreakComplete: boolean },
  ) => ImaAdsManager;
};

type LinearAdSession = {
  manager: ImaAdsManager | null;
  loader: ImaAdsLoader;
  finish: (resumeContent: boolean) => void;
};

type AdSize = { width: number; height: number };

type PauseCreative = AdSize & {
  imageUrl: string;
  clickThrough: string | null;
  impressions: string[];
  errorUrl: string | null;
};

export type VastAdLayerHandle = {
  playPreroll: () => boolean;
  showPauseAd: () => boolean;
  dismissPauseAd: () => void;
  isLinearAdActive: () => boolean;
};

let imaSdkPromise: Promise<ImaNamespace | null> | null = null;
const IMA_SDK_URL = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";

function currentIma() {
  return (window as unknown as { google?: { ima?: ImaNamespace } }).google?.ima ?? null;
}

function loadImaSdk() {
  if (imaSdkPromise) return imaSdkPromise;
  const pending = new Promise<ImaNamespace | null>((resolve) => {
    const ready = currentIma();
    if (ready) {
      resolve(ready);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-actrezz-ima="true"]');
    const script = existing ?? document.createElement("script");
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(currentIma());
    };
    const timeout = setTimeout(settle, 8_000);
    script.addEventListener("load", settle, { once: true });
    script.addEventListener("error", settle, { once: true });
    if (!existing) {
      script.src = IMA_SDK_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.actrezzIma = "true";
      document.head.appendChild(script);
    }
  });
  imaSdkPromise = pending;
  void pending.then((ima) => {
    if (!ima && imaSdkPromise === pending) imaSdkPromise = null;
  });
  return pending;
}

function fitPauseCreative(native: AdSize, playerWidth: number, playerHeight: number): AdSize {
  const availableWidth = Math.max(1, playerWidth - 16);
  const availableHeight = Math.max(1, playerHeight - 16);
  const scale = Math.min(1, availableWidth / native.width, availableHeight / native.height);
  return {
    width: Math.max(1, Math.floor(native.width * scale)),
    height: Math.max(1, Math.floor(native.height * scale)),
  };
}

function textOf(element: Element | null | undefined) {
  return element?.textContent?.trim() || "";
}

function parsePauseVast(xmlText: string): PauseCreative | null {
  const documentXml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (documentXml.querySelector("parsererror")) return null;

  for (const candidate of Array.from(documentXml.querySelectorAll("NonLinear"))) {
    const resource = Array.from(candidate.querySelectorAll("StaticResource")).find((item) =>
      (item.getAttribute("creativeType") || "").toLowerCase().startsWith("image/"),
    );
    const imageUrl = textOf(resource);
    if (!imageUrl) continue;

    const width = Number.parseInt(candidate.getAttribute("width") || "300", 10);
    const height = Number.parseInt(candidate.getAttribute("height") || "250", 10);
    return {
      imageUrl,
      clickThrough: textOf(candidate.querySelector("NonLinearClickThrough")) || null,
      impressions: Array.from(documentXml.querySelectorAll("Impression"))
        .map((item) => textOf(item))
        .filter(Boolean),
      errorUrl: textOf(documentXml.querySelector("Error")) || null,
      width: Number.isFinite(width) && width > 0 ? width : 300,
      height: Number.isFinite(height) && height > 0 ? height : 250,
    };
  }
  return null;
}

function fireTracking(url: string) {
  if (!url) return;
  void fetch(url, {
    method: "GET",
    mode: "no-cors",
    credentials: "include",
    keepalive: true,
  }).catch(() => undefined);
}

export const VastAdLayer = forwardRef<VastAdLayerHandle, {
  playerRef: RefObject<HTMLDivElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  inStreamVastUrl?: string;
  pauseDesktopVastUrl?: string;
  pauseMobileVastUrl?: string;
  autoPlayPreroll?: boolean;
  onLinearStateChange?: (active: boolean) => void;
  onResumeContent: () => void;
}>(function VastAdLayer({
  playerRef,
  videoRef,
  inStreamVastUrl,
  pauseDesktopVastUrl,
  pauseMobileVastUrl,
  autoPlayPreroll = false,
  onLinearStateChange,
  onResumeContent,
}, ref) {
  const linearContainerRef = useRef<HTMLDivElement>(null);
  const imaRef = useRef<ImaNamespace | null>(null);
  const linearSessionRef = useRef<LinearAdSession | null>(null);
  const prerollAttemptedRef = useRef(false);
  const linearActiveRef = useRef(false);
  const pauseAbortRef = useRef<AbortController | null>(null);
  const pauseLoadingRef = useRef(false);
  const pauseImpressionFiredRef = useRef(false);
  const pauseNativeSizeRef = useRef<AdSize>({ width: 300, height: 250 });
  const mountedRef = useRef(true);
  const [linearVisible, setLinearVisible] = useState(false);
  const [pauseVisible, setPauseVisible] = useState(false);
  const [pauseCreative, setPauseCreative] = useState<PauseCreative | null>(null);
  const [pauseSize, setPauseSize] = useState<AdSize>({ width: 300, height: 250 });

  useEffect(() => {
    mountedRef.current = true;
    if (inStreamVastUrl) {
      void loadImaSdk().then((ima) => {
        if (mountedRef.current) imaRef.current = ima;
      });
    }
    return () => {
      mountedRef.current = false;
      linearSessionRef.current?.finish(false);
      pauseAbortRef.current?.abort();
    };
  }, [inStreamVastUrl]);

  const dismissPauseAd = () => {
    pauseAbortRef.current?.abort();
    pauseAbortRef.current = null;
    pauseLoadingRef.current = false;
    pauseImpressionFiredRef.current = false;
    setPauseVisible(false);
    setPauseCreative(null);
  };

  const requestPauseCreative = async (slot: "desktop" | "mobile", adTagUrl: string) => {
    const controller = new AbortController();
    pauseAbortRef.current?.abort();
    pauseAbortRef.current = controller;

    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const proxyUrl = `/api/public/vast-pause?slot=${slot}`;
    const sources = isLocalhost ? [proxyUrl] : [adTagUrl, proxyUrl];
    let creative: PauseCreative | null = null;

    for (const source of sources) {
      try {
        const response = await fetch(source, {
          cache: "no-store",
          credentials: "omit",
          signal: controller.signal,
        });
        if (!response.ok) continue;
        creative = parsePauseVast(await response.text());
        if (creative) break;
      } catch {
        if (controller.signal.aborted) return;
      }
    }

    if (controller.signal.aborted || !mountedRef.current) return;
    pauseLoadingRef.current = false;
    pauseAbortRef.current = null;

    if (!creative) {
      setPauseVisible(false);
      setPauseCreative(null);
      return;
    }

    pauseNativeSizeRef.current = { width: creative.width, height: creative.height };
    const player = playerRef.current;
    if (player) {
      setPauseSize(fitPauseCreative(pauseNativeSizeRef.current, player.clientWidth, player.clientHeight));
    }
    setPauseCreative(creative);
  };

  const createLinearSession = (adTagUrl: string, target: HTMLDivElement) => {
    const ima = imaRef.current;
    const video = videoRef.current;
    const player = playerRef.current;
    if (!ima || !video || !player || !adTagUrl) return false;

    const width = Math.max(1, player.clientWidth);
    const height = Math.max(1, player.clientHeight);
    const displayContainer = new ima.AdDisplayContainer(target, video);
    const loader = new ima.AdsLoader(displayContainer);
    let manager: ImaAdsManager | null = null;
    let finished = false;
    let requestTimer: ReturnType<typeof setTimeout> | null = null;
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    let playingTimer: ReturnType<typeof setTimeout> | null = null;
    let foregroundTimer: ReturnType<typeof setTimeout> | null = null;

    // An in-stream click commonly opens a new tab. Some IMA creatives never
    // dispatch a completion event after the original tab becomes foreground
    // again, which leaves their transparent overlay above the video. When the
    // visitor returns, release that stale break and resume the content.
    const resumeAfterReturn = () => {
      if (document.hidden || !document.hasFocus()) return;
      if (foregroundTimer) clearTimeout(foregroundTimer);
      foregroundTimer = setTimeout(() => finish(true), 100);
    };

    const finish = (resumeContent: boolean) => {
      if (finished) return;
      finished = true;
      if (requestTimer) clearTimeout(requestTimer);
      if (startupTimer) clearTimeout(startupTimer);
      if (playingTimer) clearTimeout(playingTimer);
      if (foregroundTimer) clearTimeout(foregroundTimer);
      window.removeEventListener("focus", resumeAfterReturn);
      window.removeEventListener("pageshow", resumeAfterReturn);
      try { manager?.destroy(); } catch { /* third-party SDK cleanup */ }
      try { loader.destroy?.(); } catch { /* third-party SDK cleanup */ }
      target.replaceChildren();
      linearSessionRef.current = null;
      linearActiveRef.current = false;
      if (mountedRef.current) {
        setLinearVisible(false);
        onLinearStateChange?.(false);
      }
      if (resumeContent && mountedRef.current) onResumeContent();
    };

    // A click-through can open a separate advertiser tab without navigating
    // away from this player. Do not destroy the linear session on blur or
    // visibility changes: doing so consumed the one preroll attempt and left
    // visitors with no in-stream ad when they returned to this tab.

    const session: LinearAdSession = { manager, loader, finish };
    linearSessionRef.current = session;
    window.addEventListener("focus", resumeAfterReturn);
    window.addEventListener("pageshow", resumeAfterReturn);

    loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => finish(true));
    loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (rawEvent) => {
      if (finished) return;
      if (requestTimer) {
        clearTimeout(requestTimer);
        requestTimer = null;
      }
      const event = rawEvent as ImaLoadedEvent;
      const settings = new ima.AdsRenderingSettings();
      settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
      manager = event.getAdsManager(video, settings);
      session.manager = manager;

      const resume = () => finish(true);
      manager.addEventListener(ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => video.pause());
      manager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, resume);
      manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, resume);
      manager.addEventListener(ima.AdEvent.Type.COMPLETE, resume);
      manager.addEventListener(ima.AdEvent.Type.SKIPPED, resume);
      manager.addEventListener(ima.AdEvent.Type.LOADED, (adEvent) => {
        if (startupTimer) {
          clearTimeout(startupTimer);
          startupTimer = null;
        }
        if (!(adEvent.getAd?.().isLinear?.() ?? true)) finish(true);
      });
      manager.addEventListener(ima.AdEvent.Type.STARTED, () => {
        if (finished) return;
        if (startupTimer) {
          clearTimeout(startupTimer);
          startupTimer = null;
        }
        linearActiveRef.current = true;
        if (mountedRef.current) {
          setLinearVisible(true);
          onLinearStateChange?.(true);
        }
        // A provider should never be able to leave the watch player blocked
        // indefinitely if it fails to emit complete/skip/error callbacks.
        playingTimer = setTimeout(() => finish(true), 90_000);
      });

      try {
        startupTimer = setTimeout(() => finish(true), 12_000);
        manager.init(width, height, ima.ViewMode.NORMAL);
        manager.setVolume?.(video.muted ? 0 : video.volume);
        manager.start();
      } catch {
        finish(true);
      }
    });

    try {
      displayContainer.initialize();
      const request = new ima.AdsRequest();
      request.adTagUrl = adTagUrl;
      request.linearAdSlotWidth = width;
      request.linearAdSlotHeight = height;
      request.nonLinearAdSlotWidth = 0;
      request.nonLinearAdSlotHeight = 0;
      request.setAdWillAutoPlay?.(autoPlayPreroll);
      request.setAdWillPlayMuted?.(video.muted || video.volume === 0);
      loader.requestAds(request);
      requestTimer = setTimeout(() => finish(true), 12_000);
      return true;
    } catch {
      finish(true);
      return false;
    }
  };

  useImperativeHandle(ref, () => ({
    playPreroll: () => {
      if (prerollAttemptedRef.current || !inStreamVastUrl || !linearContainerRef.current) return false;
      prerollAttemptedRef.current = true;
      linearActiveRef.current = true;
      setLinearVisible(true);
      onLinearStateChange?.(true);

      const resumeWithoutAd = () => {
        linearActiveRef.current = false;
        setLinearVisible(false);
        onLinearStateChange?.(false);
        onResumeContent();
      };

      const target = linearContainerRef.current;
      const start = (ima: ImaNamespace | null) => {
        if (!mountedRef.current) return;
        if (!ima) {
          resumeWithoutAd();
          return;
        }
        imaRef.current = ima;
        if (!createLinearSession(inStreamVastUrl, target)) resumeWithoutAd();
      };

      const ready = imaRef.current || currentIma();
      if (ready) {
        start(ready);
      } else {
        // The SDK starts loading as soon as the watch player mounts. If a fast
        // user clicks before it is ready, keep the preroll request queued
        // instead of silently skipping the ad and starting the content video.
        void loadImaSdk().then(start);
      }
      return true;
    },
    showPauseAd: () => {
      const player = playerRef.current;
      if (!player || pauseLoadingRef.current || pauseCreative || linearActiveRef.current) return false;

      const useDesktop = player.clientWidth >= 728 && Boolean(pauseDesktopVastUrl);
      const slot: "desktop" | "mobile" = useDesktop ? "desktop" : "mobile";
      const adTagUrl = useDesktop
        ? pauseDesktopVastUrl
        : pauseMobileVastUrl || pauseDesktopVastUrl;
      if (!adTagUrl) return false;

      const defaultSize = slot === "desktop"
        ? { width: 728, height: 90 }
        : { width: 300, height: 250 };
      pauseNativeSizeRef.current = defaultSize;
      pauseLoadingRef.current = true;
      pauseImpressionFiredRef.current = false;
      setPauseVisible(false);
      setPauseSize(fitPauseCreative(defaultSize, player.clientWidth, player.clientHeight));
      void requestPauseCreative(slot, adTagUrl);
      return true;
    },
    dismissPauseAd,
    isLinearAdActive: () => linearActiveRef.current,
  }));

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const observer = new ResizeObserver(() => {
      const ima = imaRef.current;
      const width = Math.max(1, player.clientWidth);
      const height = Math.max(1, player.clientHeight);
      if (ima) {
        try { linearSessionRef.current?.manager?.resize(width, height, ima.ViewMode.NORMAL); } catch { /* SDK resize */ }
      }
      if (pauseCreative || pauseLoadingRef.current) {
        setPauseSize(fitPauseCreative(pauseNativeSizeRef.current, width, height));
      }
    });
    observer.observe(player);
    return () => observer.disconnect();
  }, [pauseCreative, playerRef]);

  const onPauseCreativeLoad = () => {
    if (!pauseCreative || pauseImpressionFiredRef.current) return;
    pauseImpressionFiredRef.current = true;
    pauseCreative.impressions.forEach(fireTracking);
    setPauseVisible(true);
  };

  const onPauseCreativeError = () => {
    if (pauseCreative?.errorUrl) {
      fireTracking(pauseCreative.errorUrl.replaceAll("[ERRORCODE]", "405"));
    }
    dismissPauseAd();
  };

  if (!inStreamVastUrl && !pauseDesktopVastUrl && !pauseMobileVastUrl) return null;

  const creativeImage = pauseCreative ? (
    // VAST static creatives are third-party ad assets, so a plain img is required.
    <img
      src={pauseCreative.imageUrl}
      alt="Advertisement"
      className="h-full w-full object-contain"
      onLoad={onPauseCreativeLoad}
      onError={onPauseCreativeError}
    />
  ) : null;

  return (
    <>
      {inStreamVastUrl && <link rel="preload" as="script" href={IMA_SDK_URL} crossOrigin="anonymous" />}
      <div
        ref={linearContainerRef}
        aria-label="Advertisement"
        className={cn(
          "absolute inset-0 z-40 bg-black",
          linearVisible ? "pointer-events-auto visible" : "pointer-events-none invisible",
        )}
      />
      <div
        className={cn(
          "absolute inset-0 z-30 grid place-items-center bg-black/20",
          pauseVisible ? "pointer-events-auto visible" : "pointer-events-none invisible",
        )}
      >
        <div
          aria-label="Pause advertisement"
          className="relative shrink-0 overflow-hidden bg-black"
          style={{ width: pauseSize.width, height: pauseSize.height }}
        >
          {pauseCreative?.clickThrough ? (
            <a
              href={pauseCreative.clickThrough}
              target="_blank"
              rel="noopener noreferrer sponsored"
              aria-label="Open advertisement"
              className="block h-full w-full"
            >
              {creativeImage}
            </a>
          ) : (
            <div className="h-full w-full">{creativeImage}</div>
          )}
          {pauseVisible && (
            <button
              type="button"
              aria-label="Close advertisement"
              title="Close advertisement"
              onClick={dismissPauseAd}
              className="absolute right-1 top-1 z-50 grid h-8 w-8 place-items-center rounded-full border border-white/50 bg-black/90 text-white shadow-lg hover:bg-black focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );
});
