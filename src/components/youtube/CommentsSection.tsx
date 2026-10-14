"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ChevronDown, ChevronUp, MoreVertical, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "./basics";
import { CommentAuthorBadge } from "./icons";
import { ME, useYT } from "@/store/youtube-store";
import {
  channelById,
  commentsForVideo,
  type CommentT,
} from "@/lib/youtube/data";
import { formatCompact, timeAgo } from "@/lib/youtube/format";
import { cn } from "@/lib/utils";

function CommentVotes({ comment }: { comment: CommentT }) {
  const liked = useYT((s) => s.commentLikes[comment.id]);
  const toggle = useYT((s) => s.toggleCommentLike);
  return (
    <div className="mt-1 flex items-center gap-1 text-xs text-yt-text2">
      <button
        onClick={() => toggle(comment.id)}
        aria-label="Like comment"
        className={cn(
          "grid h-7 w-7 place-items-center rounded-full hover:bg-yt-hover",
          liked && "text-yt-text"
        )}
      >
        <ThumbsUp className={cn("h-4 w-4", liked && "fill-current")} />
      </button>
      <span className="min-w-6 text-xs font-medium">
        {formatCompact(comment.likes + (liked ? 1 : 0))}
      </span>
      <button
        onClick={() => toast("Comment disliked (demo)")}
        aria-label="Dislike comment"
        className="grid h-7 w-7 place-items-center rounded-full hover:bg-yt-hover"
      >
        <ThumbsDown className="h-4 w-4" />
      </button>
      <button
        onClick={() => toast("Replies are read-only in this demo")}
        className="ml-2 rounded-full px-3 py-1 text-xs font-medium hover:bg-yt-hover"
      >
        Reply
      </button>
    </div>
  );
}

function CommentRow({ comment, opChannel }: { comment: CommentT; opChannel: string }) {
  const [showReplies, setShowReplies] = useState(false);
  return (
    <div className="flex gap-3">
      <Avatar initials={comment.initials} color={comment.color} size={40} />
      <div className="min-w-0 flex-1">
        {comment.pinned && (
          <p className="mb-1 text-xs text-yt-text2">Pinned by {opChannel}</p>
        )}
        <div className="flex flex-wrap items-center gap-1">
          <span className={cn("text-[13px] font-medium", comment.handle === "@techhorizon" && "text-yt-blue")}>
            {comment.handle}
          </span>
          <span className="text-xs text-yt-text2">{timeAgo(comment.createdAt)}</span>
          {comment.creatorHeart && (
            <span className="relative ml-1 inline-flex" title="Loved by creator">
              <HeartBadge />
            </span>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-yt-text">{comment.text}</p>
        <CommentVotes comment={comment} />
        {comment.replies.length > 0 && (
          <>
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="mt-2 flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium text-[#3ea6ff] hover:bg-[#3ea6ff]/10 dark:text-yt-blue"
            >
              {showReplies ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              {comment.replies.length} {comment.replies.length === 1 ? "reply" : "replies"}
            </button>
            {showReplies && (
              <div className="mt-2 flex flex-col gap-4 pl-2">
                {comment.replies.map((r, i) => (
                  <div key={i} className="flex gap-3">
                    <Avatar initials={r.initials} color={r.color} size={24} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={cn("text-[13px] font-medium", r.initials === "TH" && "text-yt-blue")}>
                          {r.author}
                        </span>
                        {r.initials === "TH" && <CommentAuthorBadge />}
                        <span className="text-xs text-yt-text2">{timeAgo(r.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-yt-text">{r.text}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-yt-text2">
                        <button className="grid h-7 w-7 place-items-center rounded-full hover:bg-yt-hover" aria-label="Like reply">
                          <ThumbsUp className="h-4 w-4" />
                        </button>
                        <span>{formatCompact(r.likes)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="Comment actions" className="grid h-8 w-8 place-items-center rounded-full hover:bg-yt-hover">
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="border-yt-border/50 bg-yt-surface">
          <DropdownMenuItem className="text-sm text-yt-text focus:bg-yt-hover focus:text-yt-text" onClick={() => toast("Comment reported (demo)")}>
            Report
          </DropdownMenuItem>
          <DropdownMenuItem className="text-sm text-yt-text focus:bg-yt-hover focus:text-yt-text" onClick={() => toast("Comment translated (demo)")}>
            Translate to English
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function HeartBadge() {
  return (
    <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-[#ff0000]">
      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="currentColor">
        <path d="M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 11-8 11Z" />
      </svg>
    </span>
  );
}

export function CommentsSection({
  videoId,
  channelId,
}: {
  videoId: string;
  channelId: string;
}) {
  const userCommentsMap = useYT((s) => s.userComments);
  const userComments = userCommentsMap[videoId] ?? [];
  const addComment = useYT((s) => s.addComment);
  const [sort, setSort] = useState<"top" | "new">("top");
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const ch = channelById(channelId);

  const base = useMemo(() => commentsForVideo(videoId), [videoId]);
  const all = [...userComments, ...base];
  const sorted = useMemo(() => {
    const list = [...all];
    list.sort((a, b) =>
      sort === "top"
        ? b.likes - a.likes
        : (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt
    );
    return list;
  }, [all, sort]);

  const total = 1204 + all.length * 137;

  return (
    <section className="mt-6">
      <div className="flex items-center gap-8">
        <h2 className="text-xl font-bold text-yt-text">
          {total.toLocaleString()} Comments
        </h2>
        <button
          onClick={() => setSort(sort === "top" ? "new" : "top")}
          className="flex items-center gap-2 text-sm font-medium text-yt-text"
        >
          <ArrowDown className="h-5 w-5" />
          Sort by {sort === "top" ? "top comments" : "newest first"}
        </button>
      </div>

      {/* add comment */}
      <div className="mt-6 flex gap-3">
        <Avatar initials={ME.initials} color={ME.color} size={40} />
        <div className="flex-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="Add a comment..."
            aria-label="Add a comment"
            className="w-full border-b border-yt-border bg-transparent pb-1 text-sm text-yt-text outline-none focus:border-yt-text placeholder:text-yt-text2"
          />
          {(focused || draft) && (
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDraft("");
                  setFocused(false);
                }}
                className="rounded-full px-4 py-2 text-sm font-medium text-yt-text hover:bg-yt-hover"
              >
                Cancel
              </button>
              <button
                disabled={!draft.trim()}
                onClick={() => {
                  addComment(videoId, draft.trim());
                  setDraft("");
                  setFocused(false);
                  toast("Comment posted");
                }}
                className="rounded-full bg-[#3ea6ff] px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:bg-yt-chip disabled:text-yt-text2 dark:text-yt-bg"
              >
                Comment
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {sorted.map((c) => (
          <CommentRow key={c.id} comment={c} opChannel={ch.name} />
        ))}
      </div>
    </section>
  );
}
