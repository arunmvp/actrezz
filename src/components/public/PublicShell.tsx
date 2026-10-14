import { Suspense, type ReactNode } from "react";
import { Header } from "@/components/youtube/Header";
import { MobileDrawer, Sidebar } from "@/components/youtube/Sidebar";
import { PublicRouteBinder } from "./PublicRouteBinder";
import { PublicMain } from "./PublicMain";
import { ExoClickPopunder } from "@/components/ads/ExoClickPopunder";
import { FooterAdUnit } from "@/components/ads/FooterAdUnit";
import { ExoClickFullpageInterstitial } from "@/components/ads/ExoClickFullpageInterstitial";
import { NavigationReadySignal } from "@/components/site-enhancements";

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function PublicShell({
  children,
  wide = false,
  fullWidth = false,
  flush = false,
  mobileImmersive = false,
}: {
  children: ReactNode;
  wide?: boolean;
  fullWidth?: boolean;
  flush?: boolean;
  mobileImmersive?: boolean;
}) {
  const adProviderUrl = process.env.EXOCLICK_AD_PROVIDER_URL || "https://a.magsrv.com/ad-provider.js";
  const footerOutstream = !mobileImmersive ? (
    <FooterAdUnit
      desktopFallbackZoneId={process.env.EXOCLICK_FOOTER_DESKTOP_ZONE_ID || "6042632"}
      mobileFallbackZoneId={process.env.EXOCLICK_FOOTER_MOBILE_ZONE_ID || "6042634"}
      providerUrl={adProviderUrl}
    />
  ) : null;

  return (
    <div className="min-h-screen bg-yt-bg text-yt-text">
      <Suspense fallback={null}>
        <NavigationReadySignal />
      </Suspense>
      <ExoClickPopunder
        desktopZoneId={process.env.EXOCLICK_POPUNDER_DESKTOP_ZONE_ID || process.env.EXOCLICK_POPUNDER_ZONE_ID}
        mobileZoneId={process.env.EXOCLICK_POPUNDER_MOBILE_ZONE_ID || process.env.EXOCLICK_POPUNDER_ZONE_ID}
        scriptUrl={process.env.EXOCLICK_POPUNDER_SCRIPT_URL}
        frequencyPeriod={positiveInteger(process.env.EXOCLICK_POPUNDER_FREQUENCY_PERIOD, 1)}
        frequencyCount={positiveInteger(process.env.EXOCLICK_POPUNDER_FREQUENCY_COUNT, 3)}
        triggerMethod={positiveInteger(process.env.EXOCLICK_POPUNDER_TRIGGER_METHOD, 3)}
        // Zero is intentional: the ExoClick frequency cap remains responsible
        // for the three-per-minute limit, without adding a second time delay.
        triggerDelay={nonNegativeInteger(process.env.EXOCLICK_POPUNDER_TRIGGER_DELAY, 0)}
      />
      <ExoClickFullpageInterstitial
        mobileZoneId={process.env.EXOCLICK_FULLPAGE_MOBILE_ZONE_ID}
        desktopZoneId={process.env.EXOCLICK_FULLPAGE_DESKTOP_ZONE_ID}
        providerUrl={adProviderUrl}
      />
      <Suspense fallback={null}>
        <PublicRouteBinder />
      </Suspense>
      <div className={mobileImmersive ? "hidden sm:block" : undefined}>
        <Header />
      </div>
      <Sidebar />
      <MobileDrawer />
      <PublicMain wide={wide} fullWidth={fullWidth} flush={flush} mobileImmersive={mobileImmersive} afterContent={footerOutstream}>{children}</PublicMain>
    </div>
  );
}
