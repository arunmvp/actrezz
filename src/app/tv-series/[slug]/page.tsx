import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATALOG_NATIVE_DESKTOP_SLOTS, CATALOG_NATIVE_MOBILE_SLOTS, PublicPagination, PublicVideoGrid } from "@/components/public/PublicCards";
import { PublicShell } from "@/components/public/PublicShell";
import { parsePageParam } from "@/lib/pagination";
import { findWork, listPublicVideos, workSeo } from "@/lib/public-catalog";
import { paginatedMetadata } from "@/lib/seo-pagination";

export const revalidate = 3600;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const work = await findWork("TV_SHOW", slug);
  if (!work) return {};
  const page = parsePageParam(query.page);
  const videos = await listPublicVideos({ workId: work.id, page, isShort: false });
  const seo = workSeo(work, videos.items);
  const title = seo.title;
  const description = seo.description.slice(0, 300);
  return {
    ...paginatedMetadata({ pathname: `/tv-series/${work.slug}`, page, title, description }),
    keywords: seo.keywords,
    openGraph: { type: "website", title, description, url: `/tv-series/${work.slug}` },
    twitter: { card: "summary", title, description },
    other: { rating: "adult" },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const work = await findWork("TV_SHOW", slug);
  if (!work) notFound();
  const page = parsePageParam(query.page);
  const { items, totalPages } = await listPublicVideos({ workId: work.id, page, isShort: false });
  const seo = workSeo(work, items);
  return (
    <PublicShell>
      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff2d78]">TV series scenes</p>
        <h1 className="mt-2 text-3xl font-bold">{seo.heading}</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-yt-text2">{work.description || seo.description}</p>
      </section>
      <PublicVideoGrid videos={items} sponsoredDesktopAfter={CATALOG_NATIVE_DESKTOP_SLOTS} sponsoredMobileAfter={CATALOG_NATIVE_MOBILE_SLOTS} nativeZoneIds={process.env.EXOCLICK_TV_SERIES_NATIVE_ZONE_IDS} />
      <PublicPagination page={page} totalPages={totalPages} basePath={`/tv-series/${work.slug}`} />
    </PublicShell>
  );
}
