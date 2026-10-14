"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useYT } from "@/store/youtube-store";
import {
  CHANNELS,
  SHORTS,
  VIDEOS,
} from "@/lib/youtube/data";
import { VideoRow } from "../VideoCard";
import { Avatar } from "../basics";
import { VerifiedBadge, ShortsLogo } from "../icons";
import { formatViews } from "@/lib/youtube/format";
import { Pagination, useUrlPage } from "../Pagination";

const PAGE_SIZE = 30;

export function SearchPage({
  query,
  onShare,
  initialPage = 1,
}: {
  query: string;
  onShare: (videoId: string) => void;
  initialPage?: number;
}) {
  const navigate = useYT((s) => s.navigate);
  const [page, setPage] = useUrlPage(initialPage);
  const q = query.toLowerCase();

  const actressNamesById = useMemo(
    () => new Map(CHANNELS.map((person) => [person.id, person.name.toLowerCase()])),
    []
  );

  const videos = useMemo(
    () =>
      VIDEOS.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.category.toLowerCase().includes(q) ||
          v.workTitle?.toLowerCase().includes(q) ||
          v.tags?.some((tag) => tag.toLowerCase().includes(q)) ||
          v.actressIds?.some((id) => actressNamesById.get(id)?.includes(q))
      ),
    [actressNamesById, q]
  );

  const actresses = useMemo(
    () =>
      CHANNELS.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.handle.toLowerCase().includes(q)
      ).slice(0, 1),
    [q]
  );

  const shorts = useMemo(
    () => SHORTS.filter((s) => s.title.toLowerCase().includes(q)).slice(0, 6),
    [q]
  );

  const total = videos.length + shorts.length;
  const totalPages = Math.max(1, Math.ceil(videos.length / PAGE_SIZE));
  const activePage = Math.min(page, totalPages);

  return (
    <div className="mx-auto w-full max-w-[1096px] px-4 pb-10 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-yt-text">Search results</h1><p className="mt-1 text-sm text-yt-text2">{videos.length} videos found for “{query}”</p></div>
      </div>

      {/* actress result */}
      {actresses.map((c) => (
        <div
          key={c.id}
          className="flex flex-col items-center gap-4 border-y border-yt-border/60 py-6 sm:flex-row"
        >
          <button onClick={() => navigate({ type: "channel", channelId: c.id })}>
            <Avatar initials={c.initials} color={c.color} imgSrc={c.profileImageUrl} size={112} className="sm:hidden" />
            <Avatar initials={c.initials} color={c.color} imgSrc={c.profileImageUrl} size={136} className="hidden sm:inline-flex" />
          </button>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <button
              onClick={() => navigate({ type: "channel", channelId: c.id })}
              className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:gap-2"
            >
              <span className="text-lg font-medium text-yt-text">{c.name}</span>
              {c.verified && <VerifiedBadge className="h-4 w-4" />}
              <span className="text-xs text-yt-text2">{c.handle}</span>
            </button>
            <p className="mt-1 text-xs text-yt-text2">
              Actress profile · Browse all available videos
            </p>
            <p className="mt-1 line-clamp-1 text-xs text-yt-text2">{c.description}</p>
          </div>
          <button
            onClick={() => navigate({ type: "channel", channelId: c.id })}
            className="rounded-full bg-yt-text px-4 py-2 text-sm font-medium text-yt-bg dark:bg-yt-text dark:text-yt-bg"
          >
            View profile
          </button>
        </div>
      ))}

      {/* videos */}
      <div className="flex flex-col gap-4">
        {videos.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE).map((v) => (
          <VideoRow key={v.id} video={v} onShare={() => onShare(v.id)} />
        ))}
      </div>
      <Pagination page={activePage} totalPages={totalPages} onPageChange={setPage} />

      {/* shorts shelf */}
      {shorts.length > 0 && (
        <section className="my-6 border-t border-yt-border/60 pt-6">
          <div className="mb-4 flex items-center gap-2">
            <ShortsLogo className="h-6 w-6" />
            <h2 className="text-xl font-bold">Shorts</h2>
          </div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto">
            {shorts.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate({ type: "shorts" })}
                className="group w-[160px] shrink-0 text-left"
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
                    <p className="mt-1 text-xs text-white/80">{formatViews(s.views)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {total === 0 && (
        <div className="grid place-items-center gap-4 py-24 text-center">
          <span className="grid h-24 w-24 place-items-center rounded-full bg-yt-chip">
            <Search className="h-10 w-10 text-yt-text2" />
          </span>
          <div>
            <p className="text-lg font-medium text-yt-text">No results found</p>
            <p className="mt-2 text-sm text-yt-text2">
              Try different keywords or remove search filters
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
