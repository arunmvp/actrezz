"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { ExoClickDisplayZone } from "./ExoClickDisplayZone";

type NeverBlockCreative = {
  imageUrl: string;
  clickUrl: string;
  width?: number;
  height?: number;
};

// Mobile inventory can take several seconds to report its iframe. Never race a
// direct creative with NeverBlock: replacing a visible creative loses the
// impression and makes the slot look like it refreshed on the visitor.
const DIRECT_FILL_GRACE_MS = 15_000;

/**
 * Serves the ordinary ExoClick tag first. If an ad blocker prevents that tag
 * from filling, it swaps to the server-side NeverBlock response for standard
 * image-banner zones. It deliberately does not handle VAST, popunder,
 * outstream, or full-page formats.
 */
export function NeverBlockDisplayZone({
  zoneId,
  providerUrl,
  keywords,
  mediaQuery,
  zoneClassName,
  className,
  deferUntilVisible,
  viewportMargin,
  onRequested,
  onFillChange,
  showLabel = true,
}: React.ComponentProps<typeof ExoClickDisplayZone>) {
  const [directFilled, setDirectFilled] = useState(false);
  const [creative, setCreative] = useState<NeverBlockCreative | null>(null);
  const [fallbackEligible, setFallbackEligible] = useState(!deferUntilVisible);
  const directFillRef = useRef(false);
  const fallbackRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    directFillRef.current = false;
    setDirectFilled(false);
    setCreative(null);
  }, [zoneId, mediaQuery, mediaMatches]);

  useEffect(() => {
    if (!mediaMatches || !deferUntilVisible || fallbackEligible) return;
    const element = fallbackRef.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setFallbackEligible(true);
        observer.disconnect();
      }
    }, { rootMargin: viewportMargin || "800px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [deferUntilVisible, fallbackEligible, mediaMatches, viewportMargin]);

  useEffect(() => {
    if (!mediaMatches || !fallbackEligible || directFilled || creative || !zoneId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch(`/api/nb?zone=${encodeURIComponent(zoneId)}`, {
        cache: "no-store",
        credentials: "same-origin",
      })
        .then(async (response) => response.ok ? response.json() as Promise<{ creative?: NeverBlockCreative }> : null)
        .then((payload) => {
          // A direct creative may arrive while the fallback request is in
          // flight. The ref avoids the stale-effect race that replaced a
          // visible mobile ad a few seconds later.
          if (!cancelled && !directFillRef.current && payload?.creative) setCreative(payload.creative);
        })
        .catch(() => undefined);
    }, DIRECT_FILL_GRACE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [creative, directFilled, fallbackEligible, mediaMatches, zoneId]);

  const handleFillChange = useCallback((filled: boolean) => {
    if (filled) {
      directFillRef.current = true;
      setDirectFilled(true);
    }
    onFillChange?.(filled);
  }, [onFillChange]);

  if (!mediaMatches) return null;

  if (creative) {
    return (
      <div ref={fallbackRef} className={cn("relative flex w-full min-w-0 flex-col items-center justify-start overflow-hidden", className)}>
        {showLabel && <span className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-yt-text2">Advertisement</span>}
        <a href={creative.clickUrl} target="_blank" rel="nofollow sponsored noopener noreferrer" className="block max-w-full overflow-hidden">
          {/* NeverBlock returns a remote creative URL, so this intentionally uses a native img. */}
          <img
            src={creative.imageUrl}
            alt="Advertisement"
            width={creative.width}
            height={creative.height}
            className="block h-auto max-w-full"
          />
        </a>
      </div>
    );
  }

  return (
    <div ref={fallbackRef} className="w-full">
    <ExoClickDisplayZone
      zoneId={zoneId}
      providerUrl={providerUrl}
      keywords={keywords}
      mediaQuery={mediaQuery}
      zoneClassName={zoneClassName}
      className={className}
      deferUntilVisible={deferUntilVisible}
      viewportMargin={viewportMargin}
      onRequested={onRequested}
      onFillChange={handleFillChange}
      showLabel={showLabel}
    />
    </div>
  );
}
