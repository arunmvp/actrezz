import type { Metadata } from "next";
import { DirectoryList, DirectorySearch, PublicPagination } from "@/components/public/PublicCards";
import { PublicShell } from "@/components/public/PublicShell";
import { parsePageParam } from "@/lib/pagination";
import { listActresses } from "@/lib/public-catalog";
import { paginatedMetadata } from "@/lib/seo-pagination";

export const revalidate = 3600;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ page?: string }> }): Promise<Metadata> {
  const page = parsePageParam((await searchParams).page);
  return paginatedMetadata({ pathname: "/actresses", page, title: "Actresses", description: "Browse actress profiles and related videos on Actrezz." });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const query = await searchParams;
  const page = parsePageParam(query.page);
  const q = (query.q ?? "").trim();
  const { items, totalPages } = await listActresses(page, q);
  return (
    <PublicShell>
      <section className="mb-6">
        <h1 className="text-3xl font-bold">Actresses</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-yt-text2">Explore actress profiles, screen appearances, and the related movie and TV video collections.</p>
        <DirectorySearch query={q} placeholder="Search actress name" />
      </section>
      <DirectoryList items={items} kind="actresses" />
      <PublicPagination page={page} totalPages={totalPages} basePath="/actresses" query={{ q }} />
    </PublicShell>
  );
}
