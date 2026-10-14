import type { Metadata } from "next";
import { PublicPagination, PublicVideoGrid } from "@/components/public/PublicCards";
import { PublicShell } from "@/components/public/PublicShell";
import { DeferredShortiesShelf } from "@/components/public/DeferredShortiesShelf";
import { parsePageParam } from "@/lib/pagination";
import { listPublicVideos } from "@/lib/public-catalog";
import { paginatedMetadata } from "@/lib/seo-pagination";

export const revalidate = 3600;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ page?: string }> }): Promise<Metadata> {
  const page = parsePageParam((await searchParams).page);
  return paginatedMetadata({ pathname: "/trending", page, title: "Trending Videos", description: "Explore the most popular actress scenes and celebrity videos on Actrezz." });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = parsePageParam((await searchParams).page);
  const { items, totalPages } = await listPublicVideos({ page, sort: "popular", trendingFeatured: true, pageSize: 25 });
  return (
    <PublicShell>
      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff2d78]">Trending</p>
        <h1 className="mt-2 text-3xl font-bold">Trending actress videos</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-yt-text2">A rotating selection of popular actress scenes and viewer favourites.</p>
      </section>
      <PublicVideoGrid videos={items} sponsoredDesktopAfter={[8, 16, 24]} sponsoredMobileAfter={[3, 16, 24]} />
      <PublicPagination page={page} totalPages={totalPages} basePath="/trending" />
      <DeferredShortiesShelf mode="trending" page={2} title="Shorties" />
    </PublicShell>
  );
}
