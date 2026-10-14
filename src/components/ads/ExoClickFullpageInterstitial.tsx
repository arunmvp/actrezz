"use client";

import { ExoClickDisplayZone } from "./ExoClickDisplayZone";

/**
 * Fullpage zones own their overlay, responsive sizing, capping and Close Ad
 * control inside ExoClick's provider. Do not wrap this in a site modal: that
 * would create a blank full-screen layer whenever there is no ad fill.
 */
export function ExoClickFullpageInterstitial({
  mobileZoneId,
  desktopZoneId,
  providerUrl,
}: {
  mobileZoneId?: string;
  desktopZoneId?: string;
  providerUrl?: string;
}) {
  if (!providerUrl || (!mobileZoneId && !desktopZoneId)) return null;
  return (
    <div data-popunder-exclude="true" aria-label="Advertisement">
      {mobileZoneId && (
        <ExoClickDisplayZone
          zoneId={mobileZoneId}
          providerUrl={providerUrl}
          mediaQuery="(max-width: 767px)"
          zoneClassName="eas6a97888e33"
          showLabel={false}
          allowOverlay
        />
      )}
      {desktopZoneId && (
        <ExoClickDisplayZone
          zoneId={desktopZoneId}
          providerUrl={providerUrl}
          mediaQuery="(min-width: 768px)"
          zoneClassName="eas6a97888e35"
          showLabel={false}
          allowOverlay
        />
      )}
    </div>
  );
}
