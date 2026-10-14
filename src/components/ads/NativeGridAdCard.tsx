"use client";

import { useEffect, useRef, useState } from "react";
import { ExoClickDisplayZone } from "./ExoClickDisplayZone";

export function NativeGridAdCard({
  zoneId,
  providerUrl,
  className,
  mediaQuery,
}: {
  zoneId: string;
  providerUrl: string;
  className?: string;
  mediaQuery?: string;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [hasCreative, setHasCreative] = useState(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let inView = false;
    const playPreview = () => {
      const video = card.querySelector<HTMLVideoElement>(".msg-native-widget-item video");
      if (!video || !inView) return;
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.autoplay = true;
      void video.play().catch(() => undefined);
    };
    const syncCreative = () => {
      setHasCreative(Boolean(card.querySelector(".msg-native-widget-item, iframe")));
      playPreview();
    };
    const mutations = new MutationObserver(syncCreative);
    mutations.observe(card, { childList: true, subtree: true });
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) playPreview();
      else card.querySelector<HTMLVideoElement>(".msg-native-widget-item video")?.pause();
    }, { threshold: 0.1 });
    visibility.observe(card);
    syncCreative();
    return () => {
      mutations.disconnect();
      visibility.disconnect();
    };
  }, []);

  return (
    <article ref={cardRef} aria-label="Sponsored" className={`relative ${className || ""}`}>
      {hasCreative && <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Sponsored</span>}
      <div className="native-grid-ad-card overflow-hidden">
        <ExoClickDisplayZone
          zoneId={zoneId}
          providerUrl={providerUrl}
          zoneClassName="eas6a97888e20"
          className="w-full"
          mediaQuery={mediaQuery}
          showLabel={false}
          deferUntilVisible
          viewportMargin="650px 0px"
        />
      </div>
    </article>
  );
}
