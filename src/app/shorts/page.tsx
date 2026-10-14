import type { Metadata } from "next";
import { cache } from "react";
import { PublicShell } from "@/components/public/PublicShell";
import { ShortsExploreGrid } from "@/components/public/ShortsExploreGrid";
import { listPublicShorts } from "@/lib/public-catalog";
import { paginatedMetadata } from "@/lib/seo-pagination";

export const revalidate = 3600;

const getShortsPage = cache((page: number) => listPublicShorts(page));

export async function generateMetadata(): Promise<Metadata> {
  const total = await getShortsPage(1);
  return total.total > 0
    ? {
      ...paginatedMetadata({
        pathname: "/shorts",
        page: 1,
        title: "Celebrity Nude Shorts & Sexy Video Reels",
        description: "Watch celebrity nude shorts, sexy video reels and adult vertical clips. Browse newly added short videos and performer pages on Actrezz.",
        robots: { index: false, follow: true },
      }),
      keywords: ["celebrity nude shorts", "hot celebrity shorts", "sexy video reels", "sex reels", "sex shorts", "adult reels", "celebrity short videos"],
      other: { rating: "adult" },
    }
    : { title: "Shorts coming soon", description: "Short videos will be added to Actrezz soon.", robots: { index: false, follow: true }, alternates: { canonical: "/shorts" } };
}

export default async function Page() {
  const { items, totalPages, total, page } = await getShortsPage(1);
  if (!total) {
    return (
      <PublicShell fullWidth>
        <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
          <div className="max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff2d78]">Shorts</p>
            <h1 className="mt-2 text-2xl font-bold text-yt-text">Shorts coming soon</h1>
            <p className="mt-2 text-sm leading-6 text-yt-text2">Short videos will appear here after publishing from admin.</p>
          </div>
        </div>
      </PublicShell>
    );
  }
  return (
    <PublicShell fullWidth>
      <section className="mb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff2d78]">Explore</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Celebrity nude shorts & sexy video reels</h1>
          <p className="mt-1 text-sm text-yt-text2">A continuous vertical feed designed for fast, focused discovery.</p>
        </div>
      </section>
      <ShortsExploreGrid videos={items} initialPage={page} initialTotalPages={totalPages} />
    </PublicShell>
  );
}
