"use client";

import { PublicShortsReel } from "@/components/public/PublicShortsReel";
import type { PublicVideo } from "@/lib/public-catalog";

export function ShortsReelPlayerClient({
  videos,
  initialIndex,
  vastUrl,
  bannerZoneIds,
  bannerProviderUrl,
}: {
  videos: PublicVideo[];
  initialIndex: number;
  vastUrl?: string;
  bannerZoneIds?: string[];
  bannerProviderUrl?: string;
}) {
  return (
    <PublicShortsReel
      videos={videos}
      initialIndex={initialIndex}
      page={1}
      shortsVastUrl={vastUrl}
      shortsBannerZoneIds={bannerZoneIds}
      shortsBannerProviderUrl={bannerProviderUrl}
    />
  );
}
