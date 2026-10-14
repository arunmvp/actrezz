"use client";

import { useEffect, useRef, useState } from "react";

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
type ImaDisplayContainer = { initialize: () => void };

let shortsImaPromise: Promise<ImaNamespace | null> | null = null;

function currentIma() {
  return (window as unknown as { google?: { ima?: ImaNamespace } }).google?.ima ?? null;
}

function loadImaSdk() {
  if (shortsImaPromise) return shortsImaPromise;
  shortsImaPromise = new Promise<ImaNamespace | null>((resolve) => {
    const ready = currentIma();
    if (ready) {
      resolve(ready);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-actrezz-ima="true"]');
    const script = existing ?? document.createElement("script");
    const settle = () => resolve(currentIma());
    script.addEventListener("load", settle, { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
    if (!existing) {
      script.src = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.actrezzIma = "true";
      document.head.appendChild(script);
    }
  });
  return shortsImaPromise;
}

export function ShortsAdSlide({
  active,
  muted,
  vastUrl,
  onStarted,
  onFinished,
}: {
  active: boolean;
  muted: boolean;
  vastUrl: string;
  onStarted: () => void;
  onFinished: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const contentVideoRef = useRef<HTMLVideoElement>(null);
  const sdkRef = useRef<ImaNamespace | null>(null);
  const displayContainerRef = useRef<ImaDisplayContainer | null>(null);
  const displayInitializedRef = useRef(false);
  const managerRef = useRef<ImaAdsManager | null>(null);
  const requestedRef = useRef(false);
  const finishedRef = useRef(false);
  const mutedRef = useRef(muted);
  const onStartedRef = useRef(onStarted);
  const onFinishedRef = useRef(onFinished);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "unavailable">("idle");

  useEffect(() => {
    let disposed = false;
    let idleHandle: number | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const initializeForPlayback = () => {
      if (displayInitializedRef.current || !displayContainerRef.current) return;
      try {
        displayContainerRef.current.initialize();
        displayInitializedRef.current = true;
      } catch { /* The next user gesture can retry initialization. */ }
    };

    window.addEventListener("pointerdown", initializeForPlayback, { passive: true });
    window.addEventListener("keydown", initializeForPlayback);

    // Do not compete with the first Short for network/CPU. Once the page is
    // idle, warm the small IMA runtime and leave its display container ready
    // for the next real swipe/tap. IMA on mobile is much more reliable when
    // this container is initialised from a user gesture before a timed break.
    const warm = () => {
      void loadImaSdk().then((ima) => {
        if (disposed || !ima || !adContainerRef.current || !contentVideoRef.current) return;
        sdkRef.current = ima;
        displayContainerRef.current = new ima.AdDisplayContainer(adContainerRef.current, contentVideoRef.current);
      });
    };
    if ("requestIdleCallback" in window) {
      idleHandle = window.requestIdleCallback(warm, { timeout: 3_000 });
    } else {
      fallbackTimer = setTimeout(warm, 1_500);
    }

    return () => {
      disposed = true;
      if (idleHandle !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      window.removeEventListener("pointerdown", initializeForPlayback);
      window.removeEventListener("keydown", initializeForPlayback);
      sdkRef.current = null;
      displayContainerRef.current = null;
      displayInitializedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onStartedRef.current = onStarted;
  }, [onStarted]);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    mutedRef.current = muted;
    managerRef.current?.setVolume?.(muted ? 0 : 1);
  }, [muted]);

  useEffect(() => {
    if (!active) {
      requestedRef.current = false;
      finishedRef.current = false;
      return;
    }
    if (!active || requestedRef.current || !vastUrl) return;
    requestedRef.current = true;
    setState("loading");

    let cancelled = false;
    let loader: ImaAdsLoader | null = null;
    let requestTimer: ReturnType<typeof setTimeout> | null = null;
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    let playingTimer: ReturnType<typeof setTimeout> | null = null;
    let interruptionTimer: ReturnType<typeof setTimeout> | null = null;
    let interruptionListener: (() => void) | null = null;

    const finish = (advance: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      if (requestTimer) clearTimeout(requestTimer);
      if (startupTimer) clearTimeout(startupTimer);
      if (playingTimer) clearTimeout(playingTimer);
      if (interruptionTimer) clearTimeout(interruptionTimer);
      if (interruptionListener) {
        document.removeEventListener("visibilitychange", interruptionListener);
        window.removeEventListener("blur", interruptionListener);
        interruptionListener = null;
      }
      try { managerRef.current?.destroy(); } catch { /* third-party SDK cleanup */ }
      try { loader?.destroy?.(); } catch { /* third-party SDK cleanup */ }
      managerRef.current = null;
      adContainerRef.current?.replaceChildren();
      if (!cancelled) setState(advance ? "unavailable" : "idle");
      if (advance && !cancelled) onFinishedRef.current();
    };

    // Ad click-throughs commonly open a new tab. IMA can remain in its
    // playing state when the original page loses focus, leaving no working
    // skip/resume control after the visitor returns. Treat that navigation as
    // an interrupted ad break and restore the Short immediately.
    interruptionListener = () => {
      if (interruptionTimer) clearTimeout(interruptionTimer);
      interruptionTimer = setTimeout(() => {
        if (!cancelled && (document.visibilityState === "hidden" || !document.hasFocus())) finish(true);
      }, 0);
    };
    document.addEventListener("visibilitychange", interruptionListener);
    window.addEventListener("blur", interruptionListener);

    void loadImaSdk().then((loadedIma) => {
      const ima = sdkRef.current ?? loadedIma;
      const frame = frameRef.current;
      const target = adContainerRef.current;
      const contentVideo = contentVideoRef.current;
      const displayContainer = displayContainerRef.current;
      if (cancelled || !ima || !frame || !target || !contentVideo || !displayContainer) {
        finish(true);
        return;
      }

      const width = Math.max(1, frame.clientWidth);
      const height = Math.max(1, frame.clientHeight);
      loader = new ima.AdsLoader(displayContainer);

      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => finish(true));
      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (rawEvent) => {
        if (cancelled || finishedRef.current) return;
        if (requestTimer) {
          clearTimeout(requestTimer);
          requestTimer = null;
        }

        const settings = new ima.AdsRenderingSettings();
        settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
        const manager = (rawEvent as ImaLoadedEvent).getAdsManager(contentVideo, settings);
        managerRef.current = manager;
        const complete = () => finish(true);
        manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, complete);
        manager.addEventListener(ima.AdEvent.Type.COMPLETE, complete);
        manager.addEventListener(ima.AdEvent.Type.SKIPPED, complete);
        manager.addEventListener(ima.AdEvent.Type.LOADED, (event) => {
          if (startupTimer) {
            clearTimeout(startupTimer);
            startupTimer = null;
          }
          if (!(event.getAd?.().isLinear?.() ?? true)) finish(true);
        });
        manager.addEventListener(ima.AdEvent.Type.STARTED, () => {
          if (cancelled || finishedRef.current) return;
          if (startupTimer) {
            clearTimeout(startupTimer);
            startupTimer = null;
          }
          if (!cancelled) {
            setState("playing");
            onStartedRef.current();
          }
          // Third-party click-throughs and malformed VAST responses must not
          // be able to trap the visitor in a permanent ad overlay.
          playingTimer = setTimeout(() => finish(true), 90_000);
        });

        try {
          startupTimer = setTimeout(() => finish(true), 12_000);
          manager.init(width, height, ima.ViewMode.NORMAL);
          manager.setVolume?.(mutedRef.current ? 0 : 1);
          manager.start();
        } catch {
          finish(true);
        }
      });

      try {
        if (!displayInitializedRef.current) {
          displayContainer.initialize();
          displayInitializedRef.current = true;
        }
        const request = new ima.AdsRequest();
        const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
        request.adTagUrl = isLocalhost ? "/api/public/vast-shorts" : vastUrl;
        request.linearAdSlotWidth = width;
        request.linearAdSlotHeight = height;
        request.nonLinearAdSlotWidth = 0;
        request.nonLinearAdSlotHeight = 0;
        request.setAdWillAutoPlay?.(true);
        request.setAdWillPlayMuted?.(mutedRef.current);
        loader.requestAds(request);
        requestTimer = setTimeout(() => finish(true), 12_000);
      } catch {
        finish(true);
      }
    });

    return () => {
      cancelled = true;
      if (requestTimer) clearTimeout(requestTimer);
      if (startupTimer) clearTimeout(startupTimer);
      if (playingTimer) clearTimeout(playingTimer);
      if (interruptionTimer) clearTimeout(interruptionTimer);
      if (interruptionListener) {
        document.removeEventListener("visibilitychange", interruptionListener);
        window.removeEventListener("blur", interruptionListener);
      }
      try { managerRef.current?.destroy(); } catch { /* third-party SDK cleanup */ }
      try { loader?.destroy?.(); } catch { /* third-party SDK cleanup */ }
      managerRef.current = null;
      adContainerRef.current?.replaceChildren();
    };
  }, [active, vastUrl]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => {
      const ima = currentIma();
      if (!ima || !managerRef.current) return;
      try {
        managerRef.current.resize(
          Math.max(1, frame.clientWidth),
          Math.max(1, frame.clientHeight),
          ima.ViewMode.NORMAL,
        );
      } catch { /* SDK resize */ }
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={`grid h-full w-full place-items-center transition-opacity duration-150 sm:px-4 sm:py-2 ${state === "playing" ? "pointer-events-auto bg-black opacity-100 sm:bg-yt-bg" : "pointer-events-none opacity-0"}`}>
      <div ref={frameRef} className="shorts-frame relative h-full w-full overflow-hidden bg-black sm:rounded-2xl sm:shadow-2xl sm:shadow-black/40">
        <video ref={contentVideoRef} muted playsInline aria-hidden className="pointer-events-none absolute h-px w-px opacity-0" />
        <div ref={adContainerRef} aria-label="Advertisement" className="absolute inset-0 z-10" />
        <span className="pointer-events-none absolute left-1/2 top-[max(.5rem,env(safe-area-inset-top))] z-20 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur">
          Sponsored
        </span>
      </div>
    </section>
  );
}
