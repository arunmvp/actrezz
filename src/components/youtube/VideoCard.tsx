"use client";

import { toast } from "sonner";
import {
  MoreVertical,
  Share2,
  Scissors,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, Thumb } from "./basics";
import { VerifiedBadge, LiveBadge } from "./icons";
import { useYT } from "@/store/youtube-store";
import { viewHref } from "@/store/youtube-store";
import {
  channelById,
  type Video,
} from "@/lib/youtube/data";
import { formatDuration } from "@/lib/youtube/format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* 3-dot action menu shared by all card variants                       */
/* ------------------------------------------------------------------ */

export function VideoMenu({
  video,
  onShare,
}: {
  video: Video;
  onShare?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="More actions"
          onClick={(e) => e.stopPropagation()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-yt-text opacity-100 hover:bg-yt-hover"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="w-56 border-yt-border/50 bg-yt-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem
          className="gap-3 py-2.5 text-sm text-yt-text focus:bg-yt-hover focus:text-yt-text"
          onClick={() => (onShare ? onShare() : toast("Share link copied"))}
        >
          <Share2 className="h-5 w-5" /> Share
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Grid card (home / channel / trending grids)                         */
/* ------------------------------------------------------------------ */

export function VideoCard({
  video,
  onShare,
  showChannel = true,
  className,
}: {
  video: Video;
  onShare?: () => void;
  showChannel?: boolean;
  className?: string;
}) {
  const navigate = useYT((s) => s.navigate);
  const progress = useYT((s) => s.watchProgress[video.id]);
  const ch = channelById(video.channelId);

  return (
    <div className={cn("group flex w-full flex-col gap-2", className)}>
      <a
        href={viewHref({ type: "watch", videoId: video.id })}
        onClick={(event) => { event.preventDefault(); navigate({ type: "watch", videoId: video.id }); }}
        className="relative block w-full overflow-hidden rounded-xl bg-yt-skeleton"
        aria-label={video.title}
      >
        <div className="aspect-video w-full">
          <Thumb seed={video.thumbSeed} src={video.thumbnailUrl} radius="rounded-none" />
        </div>
        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-xs font-medium text-white">
          {video.live ? <LiveBadge /> : formatDuration(video.durationSec)}
        </span>
        {progress != null && progress > 0.01 && (
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/30">
            <span
              className="block h-full bg-[#ff0000]"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </span>
        )}
        {video.isNew && (
          <span className="absolute left-1 top-1 rounded bg-[#ff0000] px-1.5 py-0.5 text-[11px] font-semibold uppercase text-white">
            New
          </span>
        )}
      </a>

      <div className="relative flex items-start gap-2.5 pr-6">
        {showChannel && (
          <a
            href={viewHref({ type: "channel", channelId: ch.id })}
            onClick={(event) => { event.preventDefault(); navigate({ type: "channel", channelId: ch.id }); }}
            className="shrink-0"
            aria-label={ch.name}
          >
            <Avatar initials={ch.initials} color={ch.color} imgSrc={ch.profileImageUrl} size={32} />
          </a>
        )}
        <div className="min-w-0 flex-1">
          <a
            href={viewHref({ type: "watch", videoId: video.id })}
            onClick={(event) => { event.preventDefault(); navigate({ type: "watch", videoId: video.id }); }}
            className="block w-full text-left"
          >
            <h3 className="line-clamp-2 text-[15px] font-medium leading-5 text-yt-text">
              {video.title}
            </h3>
          </a>
          {showChannel && (
            <button
              onClick={() => navigate({ type: "channel", channelId: ch.id })}
              className="mt-0.5 flex items-center gap-1 text-sm text-yt-text2 hover:text-yt-text"
            >
              <span className="truncate">{ch.name}</span>
              {ch.verified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" />}
            </button>
          )}
        </div>
        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <VideoMenu video={video} onShare={onShare} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compact card (watch page sidebar / more videos)                     */
/* ------------------------------------------------------------------ */

export function CompactCard({ video }: { video: Video }) {
  const navigate = useYT((s) => s.navigate);
  const progress = useYT((s) => s.watchProgress[video.id]);
  const ch = channelById(video.channelId);

  return (
    <div className="group flex gap-2">
      <a
        href={viewHref({ type: "watch", videoId: video.id })}
        onClick={(event) => { event.preventDefault(); navigate({ type: "watch", videoId: video.id }); }}
        className="relative aspect-video w-[168px] shrink-0 overflow-hidden rounded-lg bg-yt-skeleton"
        aria-label={video.title}
      >
        <Thumb seed={video.thumbSeed} src={video.thumbnailUrl} radius="rounded-none" />
        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[11px] font-medium text-white">
          {formatDuration(video.durationSec)}
        </span>
        {progress != null && progress > 0.01 && (
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/30">
            <span
              className="block h-full bg-[#ff0000]"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </span>
        )}
      </a>
      <div className="flex min-w-0 flex-1 gap-1 pr-6">
        <div className="min-w-0 flex-1">
          <a
            href={viewHref({ type: "watch", videoId: video.id })}
            onClick={(event) => { event.preventDefault(); navigate({ type: "watch", videoId: video.id }); }}
            className="block w-full text-left"
          >
            <h3 className="line-clamp-2 text-sm font-medium leading-5 text-yt-text">
              {video.title}
            </h3>
          </a>
          <a
            href={viewHref({ type: "channel", channelId: ch.id })}
            onClick={(event) => { event.preventDefault(); navigate({ type: "channel", channelId: ch.id }); }}
            className="mt-1 flex items-center gap-1 text-xs text-yt-text2 hover:text-yt-text"
          >
            <span className="truncate">{ch.name}</span>
            {ch.verified && <VerifiedBadge className="h-3 w-3 shrink-0" />}
          </a>
        </div>
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <VideoMenu video={video} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal row card (search results / trending / history lists)     */
/* ------------------------------------------------------------------ */

export function VideoRow({
  video,
  onShare,
  showDescription = true,
  compactMobile = false,
}: {
  video: Video;
  onShare?: () => void;
  showDescription?: boolean;
  compactMobile?: boolean;
}) {
  const navigate = useYT((s) => s.navigate);
  const ch = channelById(video.channelId);
  const progress = useYT((s) => s.watchProgress[video.id]);

  return (
    <div className="group flex flex-col gap-3 sm:flex-row">
      <a
        href={viewHref({ type: "watch", videoId: video.id })}
        onClick={(event) => { event.preventDefault(); navigate({ type: "watch", videoId: video.id }); }}
        className={cn(
          "relative shrink-0 overflow-hidden rounded-xl bg-yt-skeleton",
          compactMobile ? "aspect-video w-full sm:w-[246px]" : "aspect-video w-full sm:w-[360px]"
        )}
        aria-label={video.title}
      >
        <Thumb seed={video.thumbSeed} src={video.thumbnailUrl} radius="rounded-xl" />
        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-xs font-medium text-white">
          {formatDuration(video.durationSec)}
        </span>
        {progress != null && progress > 0.01 && (
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/30">
            <span
              className="block h-full bg-[#ff0000]"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </span>
        )}
      </a>

      <div className="flex min-w-0 flex-1 gap-2">
        <div className="min-w-0 flex-1">
          <a
            href={viewHref({ type: "watch", videoId: video.id })}
            onClick={(event) => { event.preventDefault(); navigate({ type: "watch", videoId: video.id }); }}
            className="block w-full text-left"
          >
            <h3
              className={cn(
                "line-clamp-2 font-medium text-yt-text",
                compactMobile ? "text-base" : "text-lg leading-6"
              )}
            >
              {video.title}
            </h3>
          </a>
          <a
            href={viewHref({ type: "channel", channelId: ch.id })}
            onClick={(event) => { event.preventDefault(); navigate({ type: "channel", channelId: ch.id }); }}
            className="mt-1 flex items-center gap-2 text-xs text-yt-text2 hover:text-yt-text"
          >
            <Avatar initials={ch.initials} color={ch.color} imgSrc={ch.profileImageUrl} size={24} />
            <span className="flex items-center gap-1 truncate">
              {ch.name}
              {ch.verified && <VerifiedBadge className="h-3 w-3 shrink-0" />}
            </span>
          </a>
          {showDescription && (
            <p className="mt-1 line-clamp-2 text-xs text-yt-text2">
              {video.description.replace(/\n+/g, " ")}
            </p>
          )}
        </div>
        <div className="self-start opacity-0 transition-opacity group-hover:opacity-100">
          <VideoMenu video={video} onShare={onShare} />
        </div>
      </div>
    </div>
  );
}

export { Scissors };
