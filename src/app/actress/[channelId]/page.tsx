import type { Metadata } from "next";
import { CATALOG_NATIVE_DESKTOP_SLOTS, CATALOG_NATIVE_MOBILE_SLOTS, PublicPagination, PublicVideoGrid } from "@/components/public/PublicCards";
import { ProfileImage } from "@/components/public/ProfileImage";
import { PublicShell } from "@/components/public/PublicShell";
import { parsePageParam } from "@/lib/pagination";
import { actressSeo, findActress, listPublicVideos, requireActress } from "@/lib/public-catalog";
import { paginatedMetadata } from "@/lib/seo-pagination";

export const revalidate = 3600;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ channelId: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const [{ channelId }, query] = await Promise.all([params, searchParams]);
  const actress = await findActress(channelId);
  if (!actress) return {};
  const page = parsePageParam(query.page);
  const videos = await listPublicVideos({ actressId: actress.id, page, isShort: false });
  const seo = actressSeo(actress, videos.items);
  const description = seo.description.slice(0, 300);
  const title = seo.title;
  const hasVerifiedProfileImage = !actress.profileImageUrl.startsWith("/images/actress-placeholder");
  return {
    ...paginatedMetadata({ pathname: `/actress/${actress.slug}`, page, title, description }),
    keywords: seo.keywords,
    openGraph: {
      type: "profile",
      title,
      description,
      url: `/actress/${actress.slug}`,
      ...(hasVerifiedProfileImage ? { images: [{ url: actress.profileImageUrl, alt: actress.name }] } : {}),
    },
    twitter: hasVerifiedProfileImage
      ? { card: "summary_large_image", title, description, images: [actress.profileImageUrl] }
      : { card: "summary", title, description },
    other: { rating: "adult" },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ channelId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ channelId }, query] = await Promise.all([params, searchParams]);
  const page = parsePageParam(query.page);
  const actress = await requireActress(channelId);
  const { items, totalPages } = await listPublicVideos({ actressId: actress.id, page, isShort: false });
  const seo = actressSeo(actress, items);
  return (
    <PublicShell>
      <section className="mb-7 flex flex-col gap-5 rounded-3xl border border-yt-border/70 bg-yt-surface2 p-5 sm:flex-row sm:items-center">
        <ProfileImage src={actress.profileImageUrl} alt={actress.name} initials={actress.initials} color={actress.color} className="h-24 w-24 text-3xl ring-1 ring-white/10" loading="eager" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff2d78]">Actress videos</p>
          <h1 className="mt-2 text-3xl font-bold text-yt-text">{seo.heading}</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-yt-text2">
            {actress.biography || seo.description}
          </p>
        </div>
      </section>
      <PublicVideoGrid videos={items} showActress={false} sponsoredDesktopAfter={CATALOG_NATIVE_DESKTOP_SLOTS} sponsoredMobileAfter={CATALOG_NATIVE_MOBILE_SLOTS} nativeZoneIds={process.env.EXOCLICK_ACTRESS_NATIVE_ZONE_IDS} />
      <PublicPagination page={page} totalPages={totalPages} basePath={`/actress/${actress.slug}`} />
    </PublicShell>
  );
}
