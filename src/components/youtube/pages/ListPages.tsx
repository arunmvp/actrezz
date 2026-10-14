"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Clock,
  History as HistoryIcon,
  ListVideo,
  Play,
  ThumbsUp,
  TrendingUp,
  UserRound,
  Flame,
} from "lucide-react";
import { useYT, ME } from "@/store/youtube-store";
import { CHANNELS, TRENDING_VIDEOS, VIDEOS } from "@/lib/youtube/data";
import type { Video } from "@/lib/youtube/data";
import { VideoCard, VideoRow } from "../VideoCard";
import { Avatar } from "../basics";
import { formatCompact, formatViews, timeAgo } from "@/lib/youtube/format";
import { cn } from "@/lib/utils";
import { Pagination, useUrlPage } from "../Pagination";

/* ------------------------------------------------------------------ */
/* Subscriptions                                                       */
/* ------------------------------------------------------------------ */

export function SubscriptionsPage({
  onShare,
}: {
  onShare: (videoId: string) => void;
}) {
  const navigate = useYT((s) => s.navigate);
  const subscribed = useYT((s) => s.subscribed);

  const subs = CHANNELS.filter((c) => subscribed[c.id]);
  const feed = useMemo(
    () =>
      VIDEOS.filter((v) => subscribed[v.channelId]).sort(
        (a, b) => b.uploadedAt - a.uploadedAt
      ),
    [subscribed]
  );

  return (
    <div className="mx-auto w-full max-w-[1284px] px-4 pb-10 pt-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-yt-text">Latest</h1>
        <button
          onClick={() => navigate({ type: "channel", channelId: CHANNELS[0].id })}
          className="rounded-full border border-yt-border px-4 py-2 text-sm font-medium text-yt-text hover:bg-yt-hover"
        >
          Manage
        </button>
      </div>

      {/* channel rail */}
      <div className="no-scrollbar mb-8 flex gap-6 overflow-x-auto pb-2">
        {subs.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate({ type: "channel", channelId: c.id })}
            className="flex w-20 shrink-0 flex-col items-center gap-1"
          >
            <Avatar initials={c.initials} color={c.color} imgSrc={c.profileImageUrl} size={64} />
            <span className="w-full truncate text-center text-xs text-yt-text">{c.name}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-4 gap-y-8">
        {feed.map((v) => (
          <VideoCard key={v.id} video={v} onShare={() => onShare(v.id)} />
        ))}
      </div>

      {feed.length === 0 && (
        <div className="grid place-items-center gap-3 py-24 text-center">
          <ListVideo className="h-16 w-16 text-yt-text2" />
          <p className="text-lg font-medium text-yt-text">No new videos</p>
          <p className="max-w-sm text-sm text-yt-text2">
            Subscribe to channels you love to see their newest videos here.
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export function HistoryPage({
  onShare,
}: {
  onShare: (videoId: string) => void;
}) {
  const watchHistory = useYT((s) => s.watchHistory);
  const clearHistory = useYT((s) => s.clearHistory);
  const userVideos = useYT((s) => s.userVideos);

  const items = useMemo(
    () =>
      watchHistory
        .map((id) => VIDEOS.find((v) => v.id === id) ?? userVideos.find((v) => v.id === id))
        .filter(Boolean as unknown as (v: Video | undefined) => v is Video),
    [watchHistory, userVideos]
  );

  return (
    <div className="mx-auto flex w-full max-w-[1284px] flex-col gap-8 px-4 pb-10 pt-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <h1 className="mb-4 text-3xl font-bold text-yt-text">Watch history</h1>
        <div className="flex flex-col gap-4">
          {items.map((v) => (
            <VideoRow key={v.id} video={v} onShare={() => onShare(v.id)} showDescription={false} compactMobile />
          ))}
        </div>
        {items.length === 0 && (
          <div className="grid place-items-center gap-3 py-24 text-center">
            <HistoryIcon className="h-16 w-16 text-yt-text2" />
            <p className="text-lg font-medium text-yt-text">No watch history</p>
            <p className="max-w-sm text-sm text-yt-text2">
              Videos you watch will show up here.
            </p>
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 lg:w-[300px]">
        <div className="flex items-center gap-4 border-b border-yt-border/60 pb-4 lg:border-none">
          <HistoryIcon className="h-6 w-6 text-yt-text" />
          <h2 className="text-base font-medium text-yt-text">History</h2>
        </div>
        <div className="mt-4 flex flex-col gap-1">
          <button
            onClick={() => toast("Search history isn't available in this demo")}
            className="flex items-center gap-4 rounded-[10px] px-3 py-2 text-sm text-yt-text hover:bg-yt-hover"
          >
            <Clock className="h-5 w-5" /> Search history
          </button>
          <button
            onClick={() => {
              clearHistory();
              toast("Watch history cleared");
            }}
            className="flex items-center gap-4 rounded-[10px] px-3 py-2 text-sm text-yt-text hover:bg-yt-hover"
          >
            <HistoryIcon className="h-5 w-5" /> Clear all watch history
          </button>
          <button
            onClick={() => toast("Pause history isn't available in this demo")}
            className="flex items-center gap-4 rounded-[10px] px-3 py-2 text-sm text-yt-text hover:bg-yt-hover"
          >
            <Clock className="h-5 w-5" /> Pause watch history
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Liked videos                                                        */
/* ------------------------------------------------------------------ */

export function LikedPage({
  onShare,
}: {
  onShare: (videoId: string) => void;
}) {
  const liked = useYT((s) => s.liked);

  const items = VIDEOS.filter((v) => liked[v.id] === "like");

  return (
    <div className="mx-auto flex w-full max-w-[1284px] flex-col gap-8 px-4 pb-10 pt-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <Flame className="h-6 w-6 text-yt-text" />
          <h1 className="text-2xl font-bold text-yt-text">Liked videos</h1>
        </div>
        <div className="mb-6 flex items-center gap-2 text-sm text-yt-text2">
          <Avatar initials={ME.initials} color={ME.color} size={24} />
          {ME.name} · {items.length} videos · <span className="text-yt-blue">Private</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-4 gap-y-8">
          {items.map((v) => (
            <VideoCard key={v.id} video={v} onShare={() => onShare(v.id)} />
          ))}
        </div>
        {items.length === 0 && (
          <div className="grid place-items-center gap-3 py-24 text-center">
            <ThumbsUp className="h-16 w-16 text-yt-text2" />
            <p className="text-lg font-medium text-yt-text">No liked videos yet</p>
            <p className="max-w-sm text-sm text-yt-text2">
              Videos you like will be saved here so you can find them later.
            </p>
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 lg:w-[300px]">
        <button
          onClick={() => useYT.getState().navigate({ type: "home" })}
          className="flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium text-yt-text hover:bg-yt-hover"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 rotate-180" fill="currentColor">
            <path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2Z" />
          </svg>
          Back to home
        </button>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trending                                                            */
/* ------------------------------------------------------------------ */

export function TrendingPage({
  onShare,
  initialPage = 1,
}: {
  onShare: (videoId: string) => void;
  initialPage?: number;
}) {
  const [page, setPage] = useUrlPage(initialPage);
  const videos = useMemo(() => TRENDING_VIDEOS, []);
  const totalPages = Math.max(1, Math.ceil(videos.length / 30));
  const activePage = Math.min(page, totalPages);

  return (
    <div className="mx-auto w-full max-w-[1096px] px-4 pb-10 pt-4">
      <div className="mb-6 flex items-center gap-3">
        <TrendingUp className="h-8 w-8 text-yt-text" />
        <h1 className="text-3xl font-bold text-yt-text">Trending</h1>
      </div>
      <div className="flex flex-col gap-4">
        {videos.slice((activePage - 1) * 30, activePage * 30).map((v) => (
          <VideoRow key={v.id} video={v} onShare={() => onShare(v.id)} />
        ))}
      </div>
      <Pagination page={activePage} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Watch later / Your videos                                           */
/* ------------------------------------------------------------------ */

export function WatchLaterPage({
  onShare,
}: {
  onShare: (videoId: string) => void;
}) {
  const watchLater = useYT((s) => s.watchLater);
  const userVideos = useYT((s) => s.userVideos);

  const items = useMemo(
    () =>
      watchLater
        .map((id) => VIDEOS.find((v) => v.id === id) ?? userVideos.find((v) => v.id === id))
        .filter((v): v is NonNullable<typeof v> => Boolean(v)),
    [watchLater, userVideos]
  );

  return (
    <div className="mx-auto w-full max-w-[1284px] px-4 pb-10 pt-4">
      <div className="mb-2 flex items-center gap-2">
        <Clock className="h-6 w-6 text-yt-text" />
        <h1 className="text-2xl font-bold text-yt-text">Watch later</h1>
      </div>
      <div className="mb-6 flex items-center gap-2 text-sm text-yt-text2">
        <Avatar initials={ME.initials} color={ME.color} size={24} />
        {ME.name} · {items.length} videos · <span className="text-yt-blue">Private</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-4 gap-y-8">
        {items.map((v) => (
          <VideoCard key={v.id} video={v} onShare={() => onShare(v.id)} />
        ))}
      </div>
      {items.length === 0 && (
        <div className="grid place-items-center gap-3 py-24 text-center">
          <Clock className="h-16 w-16 text-yt-text2" />
          <p className="text-lg font-medium text-yt-text">No saved videos yet</p>
          <p className="max-w-sm text-sm text-yt-text2">
            Use the three-dot menu on any video and choose "Save to Watch later".
          </p>
        </div>
      )}
    </div>
  );
}

export function YourVideosPage({
  onShare,
}: {
  onShare: (videoId: string) => void;
}) {
  const userVideos = useYT((s) => s.userVideos);

  return (
    <div className="mx-auto w-full max-w-[1284px] px-4 pb-10 pt-4">
      <div className="mb-2 flex items-center gap-2">
        <Play className="h-6 w-6 text-yt-text" />
        <h1 className="text-2xl font-bold text-yt-text">Your videos</h1>
      </div>
      <p className="mb-6 text-sm text-yt-text2">
        {userVideos.length} {userVideos.length === 1 ? "video" : "videos"}
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-4 gap-y-8">
        {userVideos.map((v) => (
          <VideoCard key={v.id} video={v} onShare={() => onShare(v.id)} showChannel={false} />
        ))}
      </div>
      {userVideos.length === 0 && (
        <div className="grid place-items-center gap-3 py-24 text-center">
          <UserRound className="h-16 w-16 text-yt-text2" />
          <p className="text-lg font-medium text-yt-text">No videos uploaded yet</p>
          <p className="max-w-sm text-sm text-yt-text2">
            Hit the Create button in the top-right corner to publish your first video.
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* You (profile hub)                                                   */
/* ------------------------------------------------------------------ */

export function YouPage({ onShare }: { onShare: (videoId: string) => void }) {
  const navigate = useYT((s) => s.navigate);
  const watchHistory = useYT((s) => s.watchHistory);
  const liked = useYT((s) => s.liked);
  const watchLater = useYT((s) => s.watchLater);

  const historyVideos = watchHistory
    .map((id) => VIDEOS.find((v) => v.id === id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .slice(0, 12);
  const likedVideos = VIDEOS.filter((v) => liked[v.id] === "like").slice(0, 12);
  const savedVideos = watchLater
    .map((id) => VIDEOS.find((v) => v.id === id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .slice(0, 12);

  const shelves: {
    title: string;
    icon: React.ReactNode;
    videos: typeof VIDEOS;
    viewAll: () => void;
  }[] = [
    {
      title: "History",
      icon: <HistoryIcon className="h-5 w-5" />,
      videos: historyVideos,
      viewAll: () => navigate({ type: "history" }),
    },
    {
      title: "Watch later",
      icon: <Clock className="h-5 w-5" />,
      videos: savedVideos,
      viewAll: () => navigate({ type: "watchlater" }),
    },
    {
      title: "Liked videos",
      icon: <ThumbsUp className="h-5 w-5" />,
      videos: likedVideos,
      viewAll: () => navigate({ type: "liked" }),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1284px] px-4 pb-10 pt-6">
      {/* profile header */}
      <div className="mb-8 flex items-center gap-4">
        <Avatar initials={ME.initials} color={ME.color} size={80} />
        <div>
          <h1 className="text-3xl font-bold text-yt-text">{ME.name}</h1>
          <p className="mt-1 text-sm text-yt-text2">
            {ME.handle} · <button className="text-yt-blue hover:underline" onClick={() => navigate({ type: "channel", channelId: "ch-techhorizon" })}>View channel</button>
          </p>
        </div>
      </div>

      {shelves.map((shelf) => (
        <section key={shelf.title} className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <button
              onClick={shelf.viewAll}
              className="flex items-center gap-2 text-xl font-bold text-yt-text hover:opacity-80"
            >
              {shelf.icon}
              {shelf.title}
            </button>
            <button
              onClick={shelf.viewAll}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-yt-text hover:bg-yt-hover"
            >
              View all
            </button>
          </div>
          {shelf.videos.length === 0 ? (
            <p className="py-6 text-sm text-yt-text2">
              Nothing here yet - explore and interact to fill this shelf.
            </p>
          ) : (
            <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
              {shelf.videos.map((v) => (
                <div key={v.id} className="w-[236px] shrink-0 sm:w-[310px]">
                  <VideoCard video={v} onShare={() => onShare(v.id)} showChannel={false} />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
