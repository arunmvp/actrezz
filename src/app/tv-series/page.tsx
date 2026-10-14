import type { Metadata } from "next";
import { DirectoryList, DirectorySearch, PublicPagination } from "@/components/public/PublicCards";
import { PublicShell } from "@/components/public/PublicShell";
import { parsePageParam } from "@/lib/pagination";
import { listWorks } from "@/lib/public-catalog";
import { paginatedMetadata } from "@/lib/seo-pagination";

export const revalidate = 3600;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ page?: string }> }): Promise<Metadata> {
  const page = parsePageParam((await searchParams).page);
  return paginatedMetadata({ pathname: "/tv-series", page, title: "TV Series", description: "Browse TV series video collections by title, episode and featured actress on Actrezz." });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const query = await searchParams;
  const page = parsePageParam(query.page);
  const q = (query.q ?? "").trim();
  const { items, totalPages } = await listWorks("TV_SHOW", page, q);
  return (
    <PublicShell>
      <section className="mb-6">
        <h1 className="text-3xl font-bold">TV Series</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-yt-text2">Explore TV series collections by title and episode, with linked actresses and related scenes.</p>
        <DirectorySearch query={q} placeholder="Search TV series title" />
      </section>
      <DirectoryList items={items} kind="tv-series" />
      <PublicPagination page={page} totalPages={totalPages} basePath="/tv-series" query={{ q }} />
    </PublicShell>
  );
}
