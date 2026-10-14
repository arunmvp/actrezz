"use client";

import { NeverBlockDisplayZone } from "./NeverBlockDisplayZone";

export function FooterAdUnit({
  desktopFallbackZoneId,
  mobileFallbackZoneId,
  providerUrl,
}: {
  desktopFallbackZoneId?: string;
  mobileFallbackZoneId?: string;
  providerUrl: string;
}) {
  if (!desktopFallbackZoneId && !mobileFallbackZoneId) return null;

  return (
    <section aria-label="Sponsored video" className="mx-auto mt-12 w-full max-w-3xl overflow-hidden rounded-2xl border border-yt-border/70 bg-yt-surface2 px-2 py-4 sm:px-4">
      {/* Outstream is unreliable in a footer, especially on mobile.  Serve
          the responsive display zone as the only creative here: it starts as
          soon as the visitor approaches the footer and it cannot be swapped
          out by a delayed outstream response. */}
      {desktopFallbackZoneId && (
        <NeverBlockDisplayZone
          zoneId={desktopFallbackZoneId}
          providerUrl={providerUrl}
          mediaQuery="(min-width: 768px)"
          zoneClassName="eas6a97888e2"
          deferUntilVisible
          viewportMargin="500px 0px"
        />
      )}
      {mobileFallbackZoneId && (
        <NeverBlockDisplayZone
          zoneId={mobileFallbackZoneId}
          providerUrl={providerUrl}
          mediaQuery="(max-width: 767px)"
          zoneClassName="eas6a97888e10"
          deferUntilVisible
          viewportMargin="500px 0px"
        />
      )}
    </section>
  );
}
