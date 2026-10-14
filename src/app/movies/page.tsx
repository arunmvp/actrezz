import type { Metadata } from "next";
import { DirectoryList, DirectorySearch, PublicPagination } from "@/components/public/PublicCards";
import { PublicShell } from "@/components/public/PublicShell";
import { parsePageParam } from "@/lib/pagination";
import { listWorks } from "@/lib/public-catalog";
import { paginatedMetadata } from "@/lib/seo-pagination";

export const revalidate = 3600;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ page?: string }> }): Promise<Metadata> {
  const page = parsePageParam((await searchParams).page);
  return paginatedMetadata({ pathname: "/movies", page, title: "Movies", description: "Browse movie video collections by title, with related actresses and scenes on Actrezz." });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const query = await searchParams;
  const page = parsePageParam(query.page);
  const q = (query.q ?? "").trim();
  const { items, totalPages } = await listWorks("MOVIE", page, q);
  return (
    <PublicShell>
      <section className="mb-6">
        <h1 className="text-3xl font-bold">Movies</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-yt-text2">Browse movie collections by title, then discover the related actresses and video scenes.</p>
        <DirectorySearch query={q} placeholder="Search movie title" />
      </section>
      <DirectoryList items={items} kind="movies" />
      <PublicPagination page={page} totalPages={totalPages} basePath="/movies" query={{ q }} />
    </PublicShell>
  );
}
