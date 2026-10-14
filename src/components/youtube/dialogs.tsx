"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, MessageCircle, Mail, Send, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VIDEOS } from "@/lib/youtube/data";
import { formatDuration, formatViews } from "@/lib/youtube/format";

/* ------------------------------------------------------------------ */
/* Share dialog                                                        */
/* ------------------------------------------------------------------ */

const SHARE_TARGETS = [
  { name: "Message", icon: MessageCircle, color: "#00c853" },
  { name: "Email", icon: Mail, color: "#ff7043" },
  { name: "Chat", icon: Send, color: "#2962ff" },
  { name: "More", icon: Sparkles, color: "#6d4c41" },
];

export function ShareDialog({
  videoId,
  onOpenChange,
}: {
  videoId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const video = VIDEOS.find((v) => v.id === videoId);
  const url =
    typeof window !== "undefined" && videoId
      ? `${window.location.origin}/watch/${video?.slug ?? videoId}`
      : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be unavailable; still show feedback */
    }
    setCopied(true);
    toast("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={Boolean(videoId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] gap-0 border-yt-border/50 bg-yt-surface p-0 text-yt-text sm:rounded-2xl [&>button]:text-yt-text">
        <DialogHeader className="border-b border-yt-border/60 px-4 pb-3 pt-4">
          <DialogTitle className="text-base font-medium text-yt-text">Share</DialogTitle>
          <DialogDescription className="sr-only">Share this video</DialogDescription>
        </DialogHeader>

        <div className="p-4">
          {video && (
            <div className="mb-4 flex gap-3">
              <div className="h-[54px] w-24 shrink-0 overflow-hidden rounded-md bg-yt-skeleton">
                <img
                  src={video.thumbnailUrl || `https://picsum.photos/seed/${video.thumbSeed}/96/54`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium text-yt-text">{video.title}</p>
                <p className="mt-1 text-xs text-yt-text2">
                  {formatViews(video.views)} · {formatDuration(video.durationSec)}
                </p>
              </div>
            </div>
          )}

          {/* share targets */}
          <div className="mb-6 flex gap-5">
            {SHARE_TARGETS.map((t) => (
              <button
                key={t.name}
                onClick={() => toast(`Sharing via ${t.name} isn't available in this demo`)}
                className="group flex w-16 flex-col items-center gap-2"
              >
                <span
                  className="grid h-12 w-12 place-items-center rounded-full text-white transition-transform group-hover:scale-105"
                  style={{ background: t.color }}
                >
                  <t.icon className="h-6 w-6" />
                </span>
                <span className="text-xs text-yt-text2">{t.name}</span>
              </button>
            ))}
          </div>

          {/* copy link */}
          <div className="flex items-center gap-2 rounded-xl border border-yt-border bg-yt-chip p-2 pl-4">
            <Link2 className="h-5 w-5 shrink-0 text-yt-text2" />
            <input
              readOnly
              value={url}
              aria-label="Video link"
              className="h-8 min-w-0 flex-1 bg-transparent text-sm text-yt-text outline-none"
            />
            <button
              onClick={copy}
              className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-[#3ea6ff] px-4 text-sm font-medium text-black dark:text-yt-bg"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-yt-text2">
            <input
              type="checkbox"
              checked
              onChange={() => toast("Start-at option is fixed in this demo")}
              className="h-4 w-4 accent-[#3ea6ff]"
            />
            Start at 0:00
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Upload dialog                                                       */
/* ------------------------------------------------------------------ */

const UPLOAD_CATEGORIES = [
  "All",
  "Gaming",
  "Music",
  "Cooking",
  "Science",
  "Travel",
  "Fitness",
  "Filmmaking",
  "Computer programming",
];

export function UploadDialog({
  open,
  onOpenChange,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: (info: { id: string; title: string; description: string; category: string }) => void;
}) {
  const [step, setStep] = useState<"details" | "publishing" | "done">("details");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("All");
  const [dragActive, setDragActive] = useState(false);

  const publish = () => {
    if (!title.trim()) return;
    setStep("publishing");
    setTimeout(() => {
      setStep("done");
      const id = `uv-${Date.now()}`;
      onPublished({
        id,
        title: title.trim(),
        description: description.trim() || "Uploaded via MyTube clone demo.",
        category,
      });
    }, 1600);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] gap-0 overflow-hidden border-yt-border/50 bg-yt-surface p-0 text-yt-text sm:rounded-2xl [&>button]:text-yt-text">
        <DialogHeader className="border-b border-yt-border/60 px-6 pb-3 pt-5">
          <DialogTitle className="text-base font-medium text-yt-text">Upload videos</DialogTitle>
          <DialogDescription className="sr-only">Upload a demo video</DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto yt-scroll p-6">
          {step === "details" && (
            <>
              {/* drag & drop area */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Select video file"
                onClick={() => toast("File picker simulated in this demo")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  toast("File received (simulated)");
                }}
                className={`grid cursor-pointer place-items-center gap-4 rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
                  dragActive
                    ? "border-[#3ea6ff] bg-[#3ea6ff]/10"
                    : "border-yt-border hover:border-yt-text2"
                }`}
              >
                <span className="grid h-24 w-24 place-items-center rounded-full bg-yt-chip">
                  <svg viewBox="0 0 24 24" className="h-12 w-12 text-yt-text2" fill="currentColor">
                    <path d="M12 3 6 9h12l-6-6Zm-6 9v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7H6Zm4 3h4v4h-4v-4Z" />
                  </svg>
                </span>
                <div>
                  <p className="font-medium text-yt-text">Drag and drop video files to upload</p>
                  <p className="mt-1 text-xs text-yt-text2">
                    Your videos will be private until you publish them. (Demo - no file is actually read)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast("File picker simulated in this demo");
                  }}
                  className="rounded-full bg-[#3ea6ff] px-4 py-2 text-sm font-medium text-black dark:text-yt-bg"
                >
                  Select files
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                <div>
                  <label htmlFor="upload-title" className="mb-1 block text-sm font-medium text-yt-text">
                    Title (required)
                  </label>
                  <input
                    id="upload-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={100}
                    placeholder="Add a title that describes your video"
                    className="h-10 w-full rounded-lg border border-yt-border bg-transparent px-3 text-sm text-yt-text outline-none focus:border-[#3ea6ff] placeholder:text-yt-text2"
                  />
                  <p className="mt-1 text-right text-xs text-yt-text2">{title.length}/100</p>
                </div>
                <div>
                  <label htmlFor="upload-desc" className="mb-1 block text-sm font-medium text-yt-text">
                    Description
                  </label>
                  <textarea
                    id="upload-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={5000}
                    placeholder="Tell viewers about your video"
                    className="w-full rounded-lg border border-yt-border bg-transparent p-3 text-sm text-yt-text outline-none focus:border-[#3ea6ff] placeholder:text-yt-text2"
                  />
                </div>
                <div>
                  <label htmlFor="upload-cat" className="mb-1 block text-sm font-medium text-yt-text">
                    Category
                  </label>
                  <select
                    id="upload-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-10 w-full rounded-lg border border-yt-border bg-yt-surface2 px-3 text-sm text-yt-text outline-none"
                  >
                    {UPLOAD_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {step === "publishing" && (
            <div className="grid place-items-center gap-4 py-16 text-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-yt-chip border-t-[#3ea6ff]" />
              <p className="font-medium text-yt-text">Uploading... 74%</p>
              <div className="h-1 w-64 overflow-hidden rounded-full bg-yt-chip">
                <div className="h-full w-[74%] rounded-full bg-[#3ea6ff]" />
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="grid place-items-center gap-3 py-16 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-[#00c853]/15">
                <Check className="h-8 w-8 text-[#00c853]" />
              </span>
              <p className="text-lg font-medium text-yt-text">Upload complete</p>
              <p className="text-sm text-yt-text2">Processing your video...</p>
            </div>
          )}
        </div>

        {step === "details" && (
          <div className="flex items-center justify-end gap-2 border-t border-yt-border/60 px-6 py-4">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-full px-4 py-2 text-sm font-medium text-[#3ea6ff] hover:bg-[#3ea6ff]/10"
            >
              Save as draft
            </button>
            <button
              disabled={!title.trim()}
              onClick={publish}
              className="rounded-full bg-[#3ea6ff] px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50 dark:text-yt-bg"
            >
              Publish
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
