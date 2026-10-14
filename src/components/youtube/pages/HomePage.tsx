"use client";

import { useEffect, useMemo, useRef } from "react";
import { useYT } from "@/store/youtube-store";
import { LATEST_VIDEOS, SHORTS, TRENDING_VIDEOS, VIDEOS } from "@/lib/youtube/data";
import { VideoCard } from "../VideoCard";
import { CategoryChips } from "../CategoryChips";
import { ShortsShelf } from "../ShortsShelf";
import { Pagination, useUrlPage } from "../Pagination";

const PAGE_SIZE = 36;

export function HomePage({ onShare, initialPage = 1 }: { onShare: (videoId: string) => void; initialPage?: number }) {
  const category = useYT((s) => s.category);
  const hiddenFromFeed = useYT((s) => s.hiddenFromFeed);
  const userVideos = useYT((s) => s.userVideos);
  const [page, setPage] = useUrlPage(initialPage);
  const previousCategory = useRef(category);

  useEffect(() => {
    if (previousCategory.current !== category) {
      previousCategory.current = category;
      setPage(1, true);
    }
  }, [category, setPage]);

  const videos = useMemo(() => {
    const all = [...userVideos, ...VIDEOS].filter(
      (v) => !hiddenFromFeed.includes(v.id)
    );
    if (category === "All") return all;
    if (category === "Latest" || category === "Recently added") {
      const rank = new Map(LATEST_VIDEOS.map((video, index) => [video.id, index]));
      return [...all].sort((a, b) => (rank.get(a.id) ?? 999999) - (rank.get(b.id) ?? 999999) || b.uploadedAt - a.uploadedAt);
    }
    if (category === "Trending") {
      const rank = new Map(TRENDING_VIDEOS.map((video, index) => [video.id, index]));
      return [...all].sort((a, b) => (rank.get(a.id) ?? 999999) - (rank.get(b.id) ?? 999999) || b.uploadedAt - a.uploadedAt);
    }
    if (category === "2020s") return all.filter((video) => video.year && video.year >= 2020);
    if (category === "2010s") return all.filter((video) => video.year && video.year >= 2010 && video.year < 2020);
    const matches = all.filter((v) => v.category === category);
    return matches.length > 0 ? matches : all;
  }, [category, hiddenFromFeed, userVideos]);

  const totalPages = Math.max(1, Math.ceil(videos.length / PAGE_SIZE));
  const activePage = Math.min(page, totalPages);
  const visibleVideos = videos.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const firstRow = visibleVideos.slice(0, 8);
  const rest = visibleVideos.slice(8);

  return (
    <div className="px-3 pb-10 sm:px-4 lg:px-6 xl:px-8">
      <CategoryChips />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-4 gap-y-6">
        {firstRow.map((v) => (
          <VideoCard key={v.id} video={v} onShare={() => onShare(v.id)} />
        ))}
      </div>
      {SHORTS.length > 0 && <ShortsShelf />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-4 gap-y-6">
        {rest.map((v) => (
          <VideoCard key={v.id} video={v} onShare={() => onShare(v.id)} />
        ))}
      </div>
      <Pagination page={activePage} totalPages={totalPages} onPageChange={setPage} />
      {videos.length === 0 && (
        <div className="grid place-items-center gap-2 py-24 text-center">
          <p className="text-lg font-medium text-yt-text">Nothing to show here</p>
          <p className="text-sm text-yt-text2">
            Try a different filter or check back later.
          </p>
        </div>
      )}
    </div>
  );
}
