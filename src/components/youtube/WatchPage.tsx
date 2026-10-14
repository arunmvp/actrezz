"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Share2,
} from "lucide-react";
import { Avatar } from "./basics";
import { CompactCard } from "./VideoCard";
import { VideoPlayer } from "./VideoPlayer";
import { VerifiedBadge } from "./icons";
import { useYT, viewHref } from "@/store/youtube-store";
import {
  VIDEOS,
  channelById,
  videoById,
  type Video,
} from "@/lib/youtube/data";
import { timeAgo } from "@/lib/youtube/format";
import { cn } from "@/lib/utils";

export function WatchPage({
  videoId,
  onShare,
}: {
  videoId: string;
  onShare: (videoId: string) => void;
}) {
  const navigate = useYT((s) => s.navigate);
  const userVideos = useYT((s) => s.userVideos);

  const [theater, setTheater] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  const video = useMemo(
    () => videoById(videoId) ?? userVideos.find((v) => v.id === videoId),
    [videoId, userVideos]
  );

  /* related: same work, actress, tags, year, then catalogue strength */
  const related = useMemo(() => {
    if (!video) return [];
    const others = [...userVideos, ...VIDEOS].filter((v) => v.id !== video.id);
    const videoActresses = new Set(video.actressIds ?? [video.channelId]);
    const videoTags = new Set(video.tagSlugs ?? []);
    const score = (item: Video) => {
      let value = 0;
      if (video.workSlug && item.workSlug === video.workSlug) value += 5000;
      if ((item.actressIds ?? [item.channelId]).some((id) => videoActresses.has(id))) value += 3000;
      value += (item.tagSlugs ?? []).filter((slug) => videoTags.has(slug)).length * 700;
      if (video.year && item.year === video.year) value += 350;
      if (item.category === video.category) value += 150;
      value += Math.min(100, Math.round((item.trendingScore ?? 0) / 100));
      return value;
    };
    return others.sort((a, b) => score(b) - score(a) || b.uploadedAt - a.uploadedAt);
  }, [video, userVideos]);

  /* next video for autoplay */
  const nextVideo = related[0];

  /* scroll to top when video changes */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [videoId]);

  if (!video) {
    return (
      <div className="grid place-items-center py-24 text-yt-text2">
        Video not found
      </div>
    );
  }

  const ch = channelById(video.channelId);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1754px] flex-col gap-6 xl:flex-row",
        theater ? "max-w-none px-0" : "px-2 sm:px-6"
      )}
    >
      {/* main column */}
      <div className={cn("min-w-0 flex-1", theater && "xl:flex-none xl:w-full")}>
        <div className={cn("overflow-hidden", theater ? "rounded-none" : "rounded-xl")}>
          <VideoPlayer
            key={video.id}
            videoId={video.id}
            src={video.videoUrl}
            poster={video.thumbnailUrl}
            durationSec={video.durationSec}
            theater={theater}
            onToggleTheater={() => setTheater(!theater)}
            onEnded={() => {
              if (nextVideo) {
                navigate({ type: "watch", videoId: nextVideo.id });
              }
            }}
          />
        </div>

        <div className={cn(theater && "mx-auto max-w-[1280px] px-4")}>
          <h1 className="mt-3 text-xl font-bold leading-7 text-yt-text">
            {video.title}
          </h1>

          {/* channel + actions row */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate({ type: "channel", channelId: ch.id })} aria-label={ch.name}>
                <Avatar initials={ch.initials} color={ch.color} imgSrc={ch.profileImageUrl} size={40} />
              </button>
              <div className="min-w-0">
                <button
                  onClick={() => navigate({ type: "channel", channelId: ch.id })}
                  className="flex items-center gap-1 text-base font-medium text-yt-text"
                >
                  <span className="truncate">{ch.name}</span>
                  {ch.verified && <VerifiedBadge className="h-4 w-4 shrink-0" />}
                </button>
                <p className="text-xs text-yt-text2">
                  Actress · {video.category}
                </p>
              </div>
            </div>

            {/* actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onShare(video.id)}
                className="flex h-9 items-center gap-2 rounded-full bg-yt-chip px-4 text-sm font-medium text-yt-text hover:bg-yt-hover"
              >
                <Share2 className="h-5 w-5" /> Share
              </button>
            </div>
          </div>

          {/* description */}
          <div
            className="mt-4 rounded-xl bg-yt-chip p-3 text-sm text-yt-text hover:bg-yt-hover/60"
            onClick={() => setDescOpen(!descOpen)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setDescOpen(!descOpen)}
          >
            <p className="font-medium">
              {[video.workTitle, video.year].filter(Boolean).join(" · ")} ·{" "}
              <span className="text-yt-text2">
                #{video.category.toLowerCase().replace(/\s/g, "")} #actrezz
              </span>
            </p>
            <div
              className={cn(
                "yt-desc mt-2 whitespace-pre-wrap",
                descOpen ? "max-h-[1000px]" : "max-h-[60px]"
              )}
            >
              {video.description}
            </div>
            <p className="mt-1 text-sm font-medium text-yt-text">
              {descOpen ? "Show less" : "...more"}
            </p>
          </div>
          {(video.tags?.length ?? 0) > 0 && <nav aria-label="Video tags" className="mt-3 flex flex-wrap gap-2">{video.tags?.map((tag, index) => { const slug = video.tagSlugs?.[index]; if (!slug) return null; const target = { type: "taxonomy" as const, kind: "tag" as const, slug }; return <a key={slug} href={viewHref(target)} onClick={(event) => { event.preventDefault(); navigate(target); }} className="rounded-full border border-yt-border px-3 py-1.5 text-xs text-yt-text2 hover:bg-yt-hover hover:text-yt-text">#{tag}</a>; })}</nav>}
        </div>
      </div>

      {/* related sidebar */}
      {!theater && (
        <aside className="w-full shrink-0 xl:w-[402px]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-yt-text2">Up next</p>
          </div>
          <div className="flex flex-col gap-2">
            {related.slice(0, 12).map((v) => (
              <CompactCard key={v.id} video={v} />
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

export { timeAgo };
