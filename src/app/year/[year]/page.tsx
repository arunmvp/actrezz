import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATALOG_NATIVE_DESKTOP_SLOTS, CATALOG_NATIVE_MOBILE_SLOTS, PublicPagination, PublicVideoGrid } from "@/components/public/PublicCards";
import { PublicShell } from "@/components/public/PublicShell";
import { parsePageParam } from "@/lib/pagination";
import { findYear, intentTermsFromVideos, listPublicVideos } from "@/lib/public-catalog";
import { paginatedMetadata } from "@/lib/seo-pagination";

export const revalidate = 3600;

function parseYear(value: string) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1880 && year <= new Date().getFullYear() + 1 ? year : null;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const [{ year: value }, query] = await Promise.all([params, searchParams]);
  const year = parseYear(value);
  if (!year) return {};
  const stat = await findYear(year);
  if (!stat) return {};
  const page = parsePageParam(query.page);
  const videos = await listPublicVideos({ year, page, isShort: false });
  const terms = intentTermsFromVideos(videos.items);
  const title = `${year} movie and TV adult scenes`;
  const description = `A curated selection of actress movie and TV series scenes released in ${year}${terms.length ? `, including ${terms.slice(0, 5).join(", ")}` : ""}.`;
  return {
    ...paginatedMetadata({ pathname: `/year/${year}`, page, title, description }),
    keywords: [`${year} nude scenes`, `${year} sex scenes`, `${year} movie scenes`, `${year} actress videos`, ...terms.map((term) => `${year} ${term}`)],
    openGraph: { type: "website", title, description, url: `/year/${year}` },
    twitter: { card: "summary", title, description },
    other: { rating: "adult" },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ year: value }, query] = await Promise.all([params, searchParams]);
  const year = parseYear(value);
  if (!year) notFound();
  const stat = await findYear(year);
  if (!stat) notFound();
  const page = parsePageParam(query.page);
  const { items, totalPages } = await listPublicVideos({ year, page, isShort: false });
  const terms = intentTermsFromVideos(items);
  return (
    <PublicShell>
      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff2d78]">Year archive</p>
        <h1 className="mt-2 text-3xl font-bold">{year} videos</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-yt-text2">
          A curated selection of movie and TV scenes released in {year}{terms.length ? `, with ${terms.slice(0, 5).join(", ")}` : ""}.
        </p>
      </section>
      <PublicVideoGrid videos={items} sponsoredDesktopAfter={CATALOG_NATIVE_DESKTOP_SLOTS} sponsoredMobileAfter={CATALOG_NATIVE_MOBILE_SLOTS} nativeZoneIds={process.env.EXOCLICK_YEAR_NATIVE_ZONE_IDS} />
      <PublicPagination page={page} totalPages={totalPages} basePath={`/year/${year}`} />
    </PublicShell>
  );
}
