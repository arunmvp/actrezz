"use client";

import { useMemo, useState } from "react";
import { Film } from "lucide-react";
import { useYT, viewHref } from "@/store/youtube-store";
import { CHANNELS, SHORTS, VIDEOS } from "@/lib/youtube/data";
import { VideoCard } from "../VideoCard";
import { Avatar } from "../basics";
import { VerifiedBadge } from "../icons";
import { formatViews, timeAgo } from "@/lib/youtube/format";
import { cn } from "@/lib/utils";
import { Pagination, useUrlPage } from "../Pagination";
import { buildActressSeo } from "@/lib/seo-content";

const PAGE_SIZE = 36;

export function ChannelPage({ channelId, initialPage = 1 }: { channelId: string; initialPage?: number }) {
  const navigate = useYT((s) => s.navigate);
  const [tab, setTab] = useState<"home" | "videos" | "shorts" | "about">("home");
  const [videoSort, setVideoSort] = useState<"latest" | "popular" | "oldest">("latest");
  const [page, setPage] = useUrlPage(initialPage);

  const full = useMemo(() => CHANNELS.find((c) => c.id === channelId), [channelId]);

  const channelVideos = useMemo(
    () => VIDEOS.filter((v) => v.actressIds?.includes(channelId)),
    [channelId]
  );
  const channelShorts = useMemo(
    () => SHORTS.filter((s) => s.channelId === channelId),
    [channelId]
  );

  const sortedVideos = useMemo(() => {
    const list = [...channelVideos];
    if (videoSort === "latest") list.sort((a, b) => b.uploadedAt - a.uploadedAt);
    if (videoSort === "oldest") list.sort((a, b) => a.uploadedAt - b.uploadedAt);
    if (videoSort === "popular") list.sort((a, b) => b.views - a.views);
    return list;
  }, [channelVideos, videoSort]);
  const totalVideoPages = Math.max(1, Math.ceil(sortedVideos.length / PAGE_SIZE));
  const activePage = Math.min(page, totalVideoPages);
  const seoContent = useMemo(() => full ? buildActressSeo(full.name, channelVideos) : null, [channelVideos, full]);
  const relatedWorks = useMemo(() => [...new Map(channelVideos.filter((video) => video.workSlug && video.workTitle && video.workType).map((video) => [video.workSlug, { slug: video.workSlug!, title: video.workTitle!, kind: video.workType === "MOVIE" ? "movie" as const : "tv-series" as const }])).values()].slice(0, 12), [channelVideos]);
  const relatedTags = useMemo(() => [...new Map(channelVideos.flatMap((video) => (video.tags ?? []).map((name, index) => [video.tagSlugs?.[index], { name, slug: video.tagSlugs?.[index] }])).filter(([slug]) => Boolean(slug)) as [string, { name: string; slug: string }][]).values()].slice(0, 12), [channelVideos]);

  if (!full) {
    return (
      <div className="grid place-items-center py-24 text-yt-text2">Actress not found</div>
    );
  }

  const featured = channelVideos[0];

  return (
    <div className="mx-auto w-full max-w-[1284px] px-4 pb-10">
      {/* header */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <Avatar initials={full.initials} color={full.color} imgSrc={full.profileImageUrl} size={128} className="mx-auto sm:mx-0" />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h1 className="flex items-center justify-center gap-2 text-2xl font-bold text-yt-text sm:justify-start">
            <span className="truncate">{full.name}</span>
            {full.verified && <VerifiedBadge className="h-5 w-5 shrink-0" />}
          </h1>
          <p className="mt-1 text-sm text-yt-text2">
            <span className="font-medium text-yt-text">{full.handle}</span> ·{" "}
            {channelVideos.length} videos · {channelShorts.length} shorts
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-yt-text2">
            {seoContent?.description}{" "}
            <button onClick={() => setTab("about")} className="font-medium text-yt-text hover:underline">
              more
            </button>
          </p>
          <p className="mt-1 flex items-center justify-center gap-1 text-xs text-yt-text2 sm:justify-start">
            <Film className="h-3.5 w-3.5" /> Complete catalogue profile
          </p>
        </div>
      </div>

      {/* tabs */}
      <div className="sticky top-14 z-30 mt-6 border-b border-yt-border/60 bg-yt-bg/95 backdrop-blur">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {(["home", "videos", "shorts", "about"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "relative px-4 py-3 text-base font-medium capitalize",
                tab === t ? "text-yt-text" : "text-yt-text2 hover:text-yt-text"
              )}
            >
              {t === "home" ? "Overview" : t}
              {tab === t && (
                <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-yt-text" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      {tab === "home" && (
        <div className="pt-6">
          {featured && (
            <section className="mb-8 flex flex-col gap-4 border-b border-yt-border/60 pb-8 sm:flex-row sm:gap-6">
              <button
                onClick={() => navigate({ type: "watch", videoId: featured.id })}
                className="aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-yt-skeleton sm:w-[500px]"
              >
                <img
                  src={featured.thumbnailUrl || `https://picsum.photos/seed/${featured.thumbSeed}/500/281`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
              <div>
                <h2 className="text-base font-medium text-yt-text2">Featured</h2>
                <button onClick={() => navigate({ type: "watch", videoId: featured.id })} className="mt-1 block text-left">
                  <h3 className="text-lg font-medium text-yt-text">{featured.title}</h3>
                </button>
                <p className="mt-1 text-sm text-yt-text2">
                  {[featured.workTitle, featured.year, featured.category].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-2 line-clamp-3 text-sm text-yt-text2">{featured.description}</p>
              </div>
            </section>
          )}
          {(relatedWorks.length > 0 || relatedTags.length > 0) && <section className="mb-8 border-b border-yt-border/60 pb-7">
            {relatedWorks.length > 0 && <><h2 className="text-base font-bold text-yt-text">Movies & TV series featuring {full.name}</h2><div className="mt-3 flex flex-wrap gap-2">{relatedWorks.map((work) => { const target = { type: "taxonomy" as const, kind: work.kind, slug: work.slug }; return <a key={work.slug} href={viewHref(target)} onClick={(event) => { event.preventDefault(); navigate(target); }} className="rounded-full bg-yt-chip px-3 py-1.5 text-sm text-yt-text hover:bg-yt-hover">{work.title}</a>; })}</div></>}
            {relatedTags.length > 0 && <><h2 className="mt-5 text-base font-bold text-yt-text">Popular {full.name} video tags</h2><div className="mt-3 flex flex-wrap gap-2">{relatedTags.map((tag) => { const target = { type: "taxonomy" as const, kind: "tag" as const, slug: tag.slug }; return <a key={tag.slug} href={viewHref(target)} onClick={(event) => { event.preventDefault(); navigate(target); }} className="rounded-full border border-yt-border px-3 py-1.5 text-sm text-yt-text2 hover:bg-yt-hover hover:text-yt-text">#{tag.name}</a>; })}</div></>}
          </section>}
          {channelShorts.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-bold text-yt-text">Shorts</h2>
              <div className="no-scrollbar flex gap-3 overflow-x-auto">
                {channelShorts.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => navigate({ type: "shorts" })}
                    className="w-[160px] shrink-0 text-left"
                  >
                    <div className="aspect-[9/16] overflow-hidden rounded-xl bg-yt-skeleton">
                      <img
                        src={`https://picsum.photos/seed/${s.thumbSeed}/270/480`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-medium text-yt-text">{s.title}</p>
                    <p className="text-xs text-yt-text2">{formatViews(s.views)}</p>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-3 text-lg font-bold text-yt-text">Videos</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-4 gap-y-8">
              {sortedVideos.slice(0, 12).map((v) => (
                <VideoCard key={v.id} video={v} showChannel={false} />
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "videos" && (
        <div className="pt-6">
          <div className="mb-4 flex gap-2">
            {(["latest", "popular", "oldest"] as const).map((srt) => (
              <button
                key={srt}
                onClick={() => { setVideoSort(srt); setPage(1); }}
                className={cn(
                  "h-8 rounded-lg px-3 text-sm font-medium capitalize",
                  videoSort === srt
                    ? "bg-yt-chip-active text-yt-chip-active-text"
                    : "bg-yt-chip text-yt-text hover:bg-yt-hover"
                )}
              >
                {srt}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-4 gap-y-8">
            {sortedVideos.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE).map((v) => (
              <VideoCard key={v.id} video={v} showChannel={false} />
            ))}
          </div>
          <Pagination page={activePage} totalPages={totalVideoPages} onPageChange={setPage} />
        </div>
      )}

      {tab === "shorts" && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 pt-6">
          {channelShorts.length === 0 && (
            <p className="col-span-full py-16 text-center text-sm text-yt-text2">
              No Shorts have been added for this actress yet.
            </p>
          )}
          {channelShorts.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate({ type: "shorts" })}
              className="group text-left"
            >
              <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-yt-skeleton">
                <img
                  src={`https://picsum.photos/seed/${s.thumbSeed}/270/480`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8">
                  <p className="line-clamp-2 text-sm font-medium text-white">{s.title}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-yt-text2">{formatViews(s.views)}</p>
            </button>
          ))}
        </div>
      )}

      {tab === "about" && (
        <div className="max-w-[704px] pt-6">
          <h2 className="text-base font-bold text-yt-text">Description</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-yt-text">
            {seoContent?.description || "Browse this actress profile and all available catalogue videos."}
          </p>
          <h2 className="mt-6 text-base font-bold text-yt-text">Catalogue details</h2>
          <dl className="mt-2 flex flex-col gap-2 text-sm text-yt-text2">
            <div className="flex gap-2">
              <dt className="w-32 shrink-0">Profile</dt>
              <dd>{full.handle}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0">Videos</dt>
              <dd>{channelVideos.length}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
