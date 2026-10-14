import type { Metadata } from "next";
import { DirectoryList, DirectorySearch, PublicPagination } from "@/components/public/PublicCards";
import { PublicShell } from "@/components/public/PublicShell";
import { parsePageParam } from "@/lib/pagination";
import { listTags } from "@/lib/public-catalog";
import { paginatedMetadata } from "@/lib/seo-pagination";

export const revalidate = 3600;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ page?: string }> }): Promise<Metadata> {
  const page = parsePageParam((await searchParams).page);
  return paginatedMetadata({ pathname: "/tags", page, title: "Video Tags & Genres", description: "Explore curated video tags, scenes and genres. Select a topic to discover related videos and performers on Actrezz." });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const query = await searchParams;
  const page = parsePageParam(query.page);
  const q = (query.q ?? "").trim();
  const { items, totalPages } = await listTags(page, q);
  return (
    <PublicShell>
      <section className="mb-6">
        <h1 className="text-3xl font-bold">Tags & genres</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-yt-text2">Choose a scene, theme or genre to discover related videos and performers.</p>
        <DirectorySearch query={q} placeholder="Search tags" />
      </section>
      <DirectoryList items={items} kind="tags" />
      <PublicPagination page={page} totalPages={totalPages} basePath="/tags" query={{ q }} />
    </PublicShell>
  );
}
