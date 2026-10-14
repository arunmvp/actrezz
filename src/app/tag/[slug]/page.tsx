import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATALOG_NATIVE_DESKTOP_SLOTS, CATALOG_NATIVE_MOBILE_SLOTS, PublicPagination, PublicVideoGrid } from "@/components/public/PublicCards";
import { PublicShell } from "@/components/public/PublicShell";
import { parsePageParam } from "@/lib/pagination";
import { findTag, listPublicVideos, tagSeo } from "@/lib/public-catalog";
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
  const tag = await findTag(slug);
  if (!tag) return {};
  const page = parsePageParam(query.page);
  // Keep imported Shorts out of the main celebrity topic taxonomy. Individual
  // actress-linked Shorts can still be crawled through their own canonical URL.
  const videos = await listPublicVideos({ tagId: tag.id, page, includeShorts: false });
  const seo = tagSeo(tag, videos.items);
  const title = tag.seoTitle || seo.title;
  const description = (tag.seoDescription || seo.description).slice(0, 300);
  return {
    ...paginatedMetadata({ pathname: `/tag/${tag.slug}`, page, title, description, robots: { index: videos.total >= 2, follow: true } }),
    keywords: seo.keywords,
    openGraph: { type: "website", title, description, url: `/tag/${tag.slug}` },
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
  const tag = await findTag(slug);
  if (!tag) notFound();
  const page = parsePageParam(query.page);
  const { items, totalPages } = await listPublicVideos({ tagId: tag.id, page, includeShorts: false });
  const seo = tagSeo(tag, items);
  return (
    <PublicShell>
      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff2d78]">Browse by topic</p>
        <h1 className="mt-2 text-3xl font-bold">#{tag.name} videos</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-yt-text2">{tag.seoDescription || seo.description}</p>
      </section>
      <PublicVideoGrid videos={items} sponsoredDesktopAfter={CATALOG_NATIVE_DESKTOP_SLOTS} sponsoredMobileAfter={CATALOG_NATIVE_MOBILE_SLOTS} nativeZoneIds={process.env.EXOCLICK_TAG_NATIVE_ZONE_IDS} />
      <PublicPagination page={page} totalPages={totalPages} basePath={`/tag/${tag.slug}`} />
    </PublicShell>
  );
}
