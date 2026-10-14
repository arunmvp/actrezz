"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type AdProviderQueue = Array<{ serve: Record<string, never> }>;

declare global {
  interface Window {
    AdProvider?: AdProviderQueue;
  }
}

const providerLoads = new Map<string, Promise<void>>();
const providerServeTimers = new Map<string, number>();

function loadProvider(src: string) {
  const existing = providerLoads.get(src);
  if (existing) return existing;

  const pending = new Promise<void>((resolve, reject) => {
    // Display and outstream use different ExoClick provider hosts. Reusing a
    // script from another host causes the second format to silently fail.
    const loaded = [...document.querySelectorAll<HTMLScriptElement>('script[data-actrezz-exo-provider="true"]')]
      .find((script) => script.src === src);
    if (loaded?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = loaded ?? document.createElement("script");
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("ExoClick provider failed to load.")), { once: true });
    if (!loaded) {
      script.src = src;
      script.async = true;
      script.type = "application/javascript";
      script.dataset.actrezzExoProvider = "true";
      document.head.appendChild(script);
    }
  });

  providerLoads.set(src, pending);
  return pending;
}

function requestProviderServe(src: string) {
  if (providerServeTimers.has(src)) return;
  const timer = window.setTimeout(() => {
    providerServeTimers.delete(src);
    window.AdProvider = window.AdProvider || [];
    window.AdProvider.push({ serve: {} });
  }, 0);
  providerServeTimers.set(src, timer);
}

export function ExoClickDisplayZone({
  zoneId,
  providerUrl,
  keywords,
  mediaQuery,
  deferUntilVisible = false,
  viewportMargin = "800px 0px",
  zoneClassName = "eas6a97888e",
  className,
  onRequested,
  onFillChange,
  showLabel = true,
  allowOverlay = false,
}: {
  zoneId: string;
  providerUrl: string;
  keywords?: string;
  mediaQuery?: string;
  deferUntilVisible?: boolean;
  /** Start an ad request shortly before this placement reaches the viewport. */
  viewportMargin?: string;
  zoneClassName?: string;
  className?: string;
  onRequested?: () => void;
  onFillChange?: (filled: boolean) => void;
  /** Full-page placements include their own provider disclosure and close UI. */
  showLabel?: boolean;
  /** Lets provider-owned interstitials escape the inline ad slot. */
  allowOverlay?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLModElement>(null);
  const [reachedViewport, setReachedViewport] = useState(false);
  const subscribeToMedia = useCallback((onChange: () => void) => {
    if (!mediaQuery) return () => undefined;
    const query = window.matchMedia(mediaQuery);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [mediaQuery]);
  const mediaSnapshot = useCallback(
    () => !mediaQuery || window.matchMedia(mediaQuery).matches,
    [mediaQuery],
  );
  const serverMediaSnapshot = useCallback(() => !mediaQuery, [mediaQuery]);
  const mediaMatches = useSyncExternalStore(subscribeToMedia, mediaSnapshot, serverMediaSnapshot);
  const nearViewport = !deferUntilVisible || reachedViewport;

  useEffect(() => {
    if (!deferUntilVisible || !mediaMatches) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setReachedViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: viewportMargin });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [deferUntilVisible, mediaMatches, viewportMargin]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || !zoneId || !providerUrl || !mediaMatches || !nearViewport) return;
    if (keywords) slot.dataset.keywords = keywords;

    // The provider often inserts a rendered ad beside <ins>, inside our
    // wrapper. Watching only the <ins> misses real fills and triggers the
    // NeverBlock fallback over an ad that is already visible.
    const hasCreative = () => Boolean(
      wrapperRef.current?.querySelector("iframe, img, video, canvas, object, .msg-native-widget-item, a[href]")
      || slot.textContent?.trim()
      || slot.shadowRoot?.childNodes.length,
    );
    const reportFill = () => {
      const filled = hasCreative();
      onFillChange?.(filled);
      return filled;
    };
    const mutationObserver = new MutationObserver(reportFill);
    mutationObserver.observe(wrapperRef.current || slot, { childList: true, subtree: true });

    let cancelled = false;
    let fillPoll: number | null = null;
    const pollForCreative = (startedAt = Date.now()) => {
      if (cancelled || reportFill() || Date.now() - startedAt > 12_000) return;
      fillPoll = window.setTimeout(() => pollForCreative(startedAt), 250);
    };
    void loadProvider(providerUrl).then(() => {
      if (cancelled || !slot.isConnected) return;
      onRequested?.();
      requestProviderServe(providerUrl);
      pollForCreative();
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      if (fillPoll !== null) window.clearTimeout(fillPoll);
      mutationObserver.disconnect();
      slot.replaceChildren();
    };
  }, [keywords, mediaMatches, nearViewport, onFillChange, onRequested, providerUrl, zoneId]);

  // Do not leave inactive <ins data-zoneid> elements in the DOM. ExoClick's
  // provider scans every placement when any serve call is queued, including
  // CSS-hidden placements, which can otherwise request mobile and desktop ads
  // together and render the wrong creative into a responsive layout.
  if (!mediaMatches) return null;

  return (
    <div ref={wrapperRef} className={cn("relative flex w-full min-w-0 flex-col items-center justify-start", allowOverlay ? "overflow-visible" : "overflow-hidden", className)}>
      {showLabel && <span className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-yt-text2">Advertisement</span>}
      {nearViewport && (
        <ins ref={slotRef} className={cn(zoneClassName, "block max-w-full overflow-hidden")} data-zoneid={zoneId} />
      )}
    </div>
  );
}
