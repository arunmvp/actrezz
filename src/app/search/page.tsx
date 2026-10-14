import type { Metadata } from "next";
import { CATALOG_NATIVE_DESKTOP_SLOTS, CATALOG_NATIVE_MOBILE_SLOTS, PublicPagination, PublicVideoGrid } from "@/components/public/PublicCards";
import { PublicShell } from "@/components/public/PublicShell";
import { parsePageParam } from "@/lib/pagination";
import { searchPublicVideos } from "@/lib/public-catalog";

export const metadata: Metadata = {
  title: "Search",
  description: "Search the Actrezz video catalogue.",
  robots: { index: false, follow: true },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const values = await searchParams;
  const query = (values.q || "").trim().slice(0, 100);
  const page = parsePageParam(values.page);
  const { items, totalPages, total } = await searchPublicVideos(query, page);
  return (
    <PublicShell>
      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff2d78]">Search</p>
        <h1 className="mt-2 text-3xl font-bold">{query ? `Search results for “${query}”` : "Search videos"}</h1>
        <form action="/search" className="mt-4 flex max-w-2xl items-center gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search videos, actresses, movies, tags"
            className="h-11 min-w-0 flex-1 rounded-full border border-yt-border bg-yt-search-bg px-4 text-sm text-yt-text outline-none placeholder:text-yt-text2 focus:border-yt-blue"
          />
          <button type="submit" className="h-11 rounded-full bg-yt-text px-5 text-sm font-semibold text-yt-bg hover:opacity-90">Search</button>
        </form>
        <p className="mt-3 text-sm text-yt-text2">{query ? `${total} matching videos.` : "Type an actress, movie, series or tag."}</p>
      </section>
      <PublicVideoGrid videos={items} sponsoredDesktopAfter={CATALOG_NATIVE_DESKTOP_SLOTS} sponsoredMobileAfter={CATALOG_NATIVE_MOBILE_SLOTS} nativeZoneIds={process.env.EXOCLICK_CATALOGUE_NATIVE_ZONE_IDS} />
      <PublicPagination page={page} totalPages={totalPages} basePath="/search" query={{ q: query }} />
    </PublicShell>
  );
}
