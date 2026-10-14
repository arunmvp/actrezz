import type { Metadata } from "next";
import { DirectoryList, PublicPagination } from "@/components/public/PublicCards";
import { PublicShell } from "@/components/public/PublicShell";
import { parsePageParam } from "@/lib/pagination";
import { listYears } from "@/lib/public-catalog";
import { paginatedMetadata } from "@/lib/seo-pagination";

export const revalidate = 3600;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ page?: string }> }): Promise<Metadata> {
  const page = parsePageParam((await searchParams).page);
  return paginatedMetadata({ pathname: "/years", page, title: "Videos by Year", description: "Browse movie and TV video collections by release year on Actrezz." });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = parsePageParam((await searchParams).page);
  const { items, totalPages } = await listYears(page);
  return <PublicShell><section className="mb-6"><h1 className="text-3xl font-bold">Years</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-yt-text2">Browse movie and TV video collections by release year.</p></section><DirectoryList items={items} kind="years" /><PublicPagination page={page} totalPages={totalPages} basePath="/years" /></PublicShell>;
}
