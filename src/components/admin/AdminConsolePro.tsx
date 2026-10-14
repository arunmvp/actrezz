"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  ExternalLink,
  FileVideo2,
  Film,
  HardDrive,
  ImageIcon,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Plus,
  Search,
  SearchCheck,
  Settings,
  ShieldCheck,
  Smartphone,
  Tags,
  UploadCloud,
  UserPlus,
  UsersRound,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/youtube/icons";
import { cn } from "@/lib/utils";
import { ImportStudio } from "@/components/admin/ImportStudio";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";

export const ADMIN_SECTIONS = [
  "overview",
  "videos",
  "actresses",
  "works",
  "shorts",
  "tags",
  "media",
  "imports",
  "seo",
  "settings",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

type Option = {
  id: string;
  name?: string;
  title?: string;
  slug: string;
  videoCount?: number;
  type?: "MOVIE" | "TV_SHOW";
  releaseYear?: number | null;
  label?: string;
  typeLabel?: string;
};
type AdminVideo = {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  year?: number | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string[] | null;
  r2VideoKey?: string | null;
  r2ThumbnailKey?: string | null;
  status: "DRAFT" | "PROCESSING" | "READY" | "FAILED" | "HIDDEN";
  isShort: boolean;
  durationSeconds?: number | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: string | null;
  work?: {
    id: string;
    title: string;
    type: "MOVIE" | "TV_SHOW";
    slug: string;
  } | null;
  actresses: { id: string; name: string; slug: string }[];
  tags: { id: string; name: string; slug: string }[];
};
type OptionsPayload = {
  stats: {
    videoCount: number;
    actressCount: number;
    movieCount: number;
    tvSeriesCount: number;
    tagCount: number;
    shortCount: number;
  };
  readiness: {
    database: boolean;
    r2: boolean;
    mediaDomain: boolean;
    shortsIndexable: boolean;
  };
  actresses: Option[];
  works: Option[];
  tags: Option[];
  recentVideos: Array<{
    id: string;
    title: string;
    status: string;
    isShort: boolean;
    thumbnailUrl?: string | null;
    actresses: string[];
  }>;
};
type TwitterShortImport = {
  sourceUrl: string;
  sourceProvider: string;
  title?: string;
  description?: string;
  durationSeconds?: number | null;
  video: { key: string; publicUrl: string; sizeBytes?: number };
  thumbnail?: { key: string; publicUrl: string; sizeBytes?: number } | null;
};
type ShortMetadataPayload = {
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  tags: string[];
  provider: "openrouter" | "gemini" | "local";
};

const nav: { id: AdminSection; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "videos", label: "Videos", icon: Video },
  { id: "actresses", label: "Actresses", icon: UsersRound },
  { id: "works", label: "Movies & series", icon: Clapperboard },
  { id: "shorts", label: "Shorts", icon: Smartphone },
  { id: "tags", label: "Tags", icon: Tags },
  { id: "media", label: "Media storage", icon: HardDrive },
  { id: "imports", label: "Import queue", icon: UploadCloud },
  { id: "seo", label: "SEO", icon: SearchCheck },
  { id: "settings", label: "Settings", icon: Settings },
];

function Status({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: "green" | "amber" | "zinc" | "red";
}) {
  const styles = {
    green: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    zinc: "bg-white/5 text-zinc-300 ring-white/10",
    red: "bg-red-500/10 text-red-300 ring-red-500/20",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        styles,
      )}
    >
      {children}
    </span>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-zinc-400">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-zinc-300">
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{note}</p>
    </div>
  );
}

function useAdminOptions() {
  const [data, setData] = useState<OptionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/catalog/options", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Unable to load admin options");
      setData(payload);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load admin options",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);
  return { data, loading, refresh };
}

function SelectBox({
  label,
  placeholder,
  options,
  selected,
  onChange,
  multiple = false,
  allowCustom = false,
  lookupKind,
}: {
  label: string;
  placeholder: string;
  options: Option[];
  selected: Option[];
  onChange: (items: Option[]) => void;
  multiple?: boolean;
  allowCustom?: boolean;
  lookupKind: "actress" | "work" | "tag";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Option[]>(options);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          kind: lookupKind,
          q: query,
          page: String(page),
        });
        const response = await fetch("/api/admin/catalog/options?" + params, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Unable to load choices");
        if (!controller.signal.aborted) {
          setRows((old) => (page === 1 ? data.items : [...old, ...data.items]));
          setHasMore(data.hasMore);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Unable to load choices");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, lookupKind, query, page]);
  const selectedIds = new Set(selected.map((item) => item.id));
  const choose = (item: Option) => {
    onChange(
      multiple
        ? selectedIds.has(item.id)
          ? selected.filter((current) => current.id !== item.id)
          : [...selected, item]
        : [item],
    );
    if (!multiple) setOpen(false);
  };
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900 px-3 text-left text-sm"
          >
            <span className="truncate">
              {selected.length
                ? selected.map((item) => item.name || item.title).join(", ")
                : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[160] w-[var(--radix-popover-trigger-width)] border-white/10 bg-zinc-950 p-0 text-white"
          align="start"
        >
          <Command shouldFilter={false} className="bg-transparent text-white">
            <CommandInput
              value={query}
              onValueChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder={"Search all " + label.toLowerCase()}
            />
            <CommandList>
              {loading && (
                <p className="p-3 text-xs text-zinc-400">Searching…</p>
              )}
              {error && (
                <p role="alert" className="p-3 text-sm text-red-300">
                  {error}
                </p>
              )}
              <CommandEmpty>No matching records.</CommandEmpty>
              {rows.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => choose(item)}
                  className="cursor-pointer text-zinc-200"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {item.name || item.title}
                    {item.type
                      ? " · " + (item.type === "MOVIE" ? "Movie" : "TV series")
                      : ""}
                  </span>
                  {selectedIds.has(item.id) && <Check className="h-4 w-4" />}
                </CommandItem>
              ))}
              {allowCustom &&
                query.trim() &&
                !rows.some(
                  (item) =>
                    (item.name || item.title || "").toLowerCase() ===
                    query.trim().toLowerCase(),
                ) && (
                  <CommandItem
                    value={"custom:" + query}
                    onSelect={() =>
                      choose({
                        id: "custom:" + query.trim(),
                        name: query.trim(),
                        title: query.trim(),
                        slug: "",
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add “{query.trim()}”
                  </CommandItem>
                )}
              {hasMore && (
                <CommandItem
                  disabled={loading}
                  value="load-more"
                  onSelect={() => setPage((value) => value + 1)}
                >
                  Load more
                </CommandItem>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onChange(selected.filter((current) => current.id !== item.id))
              }
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs"
            >
              {item.name || item.title}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChoicePills<T extends string>({
  label,
  value,
  onChange,
  choices,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  choices: { value: T; label: string; hint?: string }[];
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))" }}>
        {choices.map((choice) => {
          const active = choice.value === value;
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(choice.value)}
              className={cn(
                "min-h-11 rounded-xl border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff2d78]",
                active
                  ? "border-[#ff2d78] bg-[#ff2d78]/15 text-white shadow-[0_0_0_1px_rgba(255,45,120,.2)]"
                  : "border-white/10 bg-white/[.035] text-zinc-400 hover:border-white/20 hover:bg-white/[.07] hover:text-zinc-100",
              )}
            >
              <span className="block font-medium">{choice.label}</span>
              {choice.hint && <span className="mt-0.5 block text-[11px] text-zinc-500">{choice.hint}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

async function uploadToR2(file: File, kind: "video" | "thumbnail") {
  const response = await fetch("/api/admin/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, kind }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Upload setup failed");
  const upload = await fetch(payload.uploadUrl, { method: "PUT", body: file });
  if (!upload.ok) throw new Error(`R2 upload failed (${upload.status})`);
  return payload as { key: string; publicUrl: string };
}

async function importTwitterShort(url: string) {
  const response = await fetch("/api/admin/uploads/twitter-short", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Twitter/X import failed");
  return payload as TwitterShortImport;
}

async function generateShortMetadata(input: {
  brief: string;
  actresses: string[];
  subjectType: "actress" | "random";
  twitterTitle?: string;
  twitterDescription?: string;
}) {
  const response = await fetch("/api/admin/ai/short-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "AI metadata failed");
  return payload as ShortMetadataPayload;
}

function captureThumbnail(
  videoFile: File,
): Promise<{ file: File; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(videoFile);
    let capturedDuration = 0;
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    video.onloadedmetadata = () => {
      capturedDuration = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = Math.min(
        Math.max(capturedDuration * 0.18, 1),
        Math.max(capturedDuration - 0.25, 0),
      );
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read video metadata for thumbnail."));
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(640, video.videoWidth || 640);
      canvas.height = Math.round(
        canvas.width / ((video.videoWidth || 16) / (video.videoHeight || 9)),
      );
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Unable to create thumbnail canvas."));
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error("Unable to generate thumbnail."));
            return;
          }
          resolve({
            file: new File(
              [blob],
              `${videoFile.name.replace(/\.[^.]+$/, "")}-thumb.webp`,
              { type: "image/webp" },
            ),
            duration: capturedDuration,
          });
        },
        "image/webp",
        0.82,
      );
    };
  });
}

function QuickAdd({
  open,
  close,
  options,
  refresh,
  initial,
  addActress,
  initialKind,
}: {
  initial?: AdminVideo | null;
  initialKind?: "video" | "short" | null;
  addActress: () => void;
  open: boolean;
  close: () => void;
  options: OptionsPayload | null;
  refresh: () => Promise<void>;
}) {
  const [kind, setKind] = useState<"video" | "short">(
    initial?.isShort ? "short" : (initialKind ?? "video"),
  );
  const [shortSubject, setShortSubject] = useState<"actress" | "random">(
    initial?.isShort && !initial.actresses.length ? "random" : "actress",
  );
  const [sourceMode, setSourceMode] = useState<"file" | "twitter">("file");
  const [status, setStatus] = useState<AdminVideo["status"]>(
    initial?.status ?? "DRAFT",
  );
  const [workType, setWorkType] = useState<"MOVIE" | "TV_SHOW">(
    initial?.work?.type ?? "MOVIE",
  );
  const [actresses, setActresses] = useState<Option[]>(
    initial?.actresses ?? [],
  );
  const [work, setWork] = useState<Option[]>(
    initial?.work ? [initial.work] : [],
  );
  const [tags, setTags] = useState<Option[]>(initial?.tags ?? []);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(
    initial?.durationSeconds ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [shortBrief, setShortBrief] = useState("");
  const [thumbnailMode, setThumbnailMode] = useState<"auto" | "manual">("auto");
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!videoFile || thumbnailMode !== "auto") return;
    let active = true;
    captureThumbnail(videoFile)
      .then(({ file, duration: detectedDuration }) => {
        if (!active) return;
        setThumbFile(file);
        setDuration(Math.round(detectedDuration));
      })
      .catch((error) => {
        if (active)
          toast.warning(
            error instanceof Error ? error.message : "Auto thumbnail failed",
          );
      });
    return () => {
      active = false;
    };
  }, [thumbnailMode, videoFile]);

  const setFormValue = (name: string, value: string) => {
    const field = formRef.current?.elements.namedItem(name);
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement
    )
      field.value = value;
  };

  async function autofillShortMetadata() {
    const brief = shortBrief.trim();
    if (!brief && (shortSubject === "random" || actresses.length === 0))
      return toast.error("Short pathi one-line brief add pannunga.");
    setAiBusy(true);
    try {
      const metadata = await generateShortMetadata({
        brief,
        actresses: actresses
          .map((item) => item.name || item.title || "")
          .filter(Boolean),
        subjectType: shortSubject,
      });
      setFormValue("title", metadata.title);
      setFormValue("description", metadata.description);
      setFormValue("seoTitle", metadata.seoTitle);
      setFormValue("seoDescription", metadata.seoDescription);
      setFormValue("seoKeywords", metadata.seoKeywords.join(", "));
      setTags(
        metadata.tags.map((name) => ({ id: `custom:${name}`, name, slug: "" })),
      );
      toast.success(
        `Short metadata filled${metadata.provider === "local" ? " locally" : ` with ${metadata.provider}`}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "AI metadata failed",
      );
    } finally {
      setAiBusy(false);
    }
  }

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    const twitterUrl = String(data.get("twitterUrl") || "").trim();
    if (!title) return toast.error("Title required.");
    if (kind === "video" && actresses.length === 0)
      return toast.error("Choose at least one actress.");
    if (
      kind === "short" &&
      shortSubject === "actress" &&
      actresses.length === 0
    )
      return toast.error("Choose an actress or select Unidentified adult woman.");
    if (kind === "short" && sourceMode === "twitter") {
      if (!twitterUrl) return toast.error("Paste a Twitter/X video link.");
    } else if (!videoFile && !String(data.get("videoUrl") || "").trim())
      return toast.error("Upload a video or provide public video URL.");
    if (kind === "short" && videoFile && !videoFile.type.includes("video"))
      return toast.error("Choose a video file for Shorts.");
    setBusy(true);
    try {
      let videoUpload: { key: string; publicUrl: string } | null = null;
      let thumbUpload: { key: string; publicUrl: string } | null = null;
      let twitterImport: TwitterShortImport | null = null;
      let finalDuration =
        duration || Number(data.get("durationSeconds")) || null;
      if (kind === "short" && sourceMode === "twitter") {
        toast.info("Processing Twitter/X video and uploading to R2...");
        twitterImport = await importTwitterShort(twitterUrl);
        videoUpload = twitterImport.video;
        thumbUpload = twitterImport.thumbnail ?? null;
        finalDuration = finalDuration || twitterImport.durationSeconds || null;
      } else if (videoFile) {
        toast.info("Uploading video to Cloudflare R2...");
        videoUpload = await uploadToR2(videoFile, "video");
      }
      if (sourceMode === "file" && thumbFile) {
        toast.info("Uploading thumbnail to Cloudflare R2...");
        thumbUpload = await uploadToR2(thumbFile, "thumbnail");
      }
      const tagNames = tags
        .map((item) => item.name || item.title || "")
        .filter(Boolean);
      const seoKeywords = String(data.get("seoKeywords") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const response = await fetch("/api/admin/catalog/videos", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initial?.id,
          title,
          description: String(data.get("description") || ""),
          durationSeconds: finalDuration,
          year: Number(data.get("year")) || null,
          seasonNumber: Number(data.get("seasonNumber")) || null,
          episodeNumber: Number(data.get("episodeNumber")) || null,
          isShort: kind === "short",
          status,
          videoUrl:
            videoUpload?.publicUrl || String(data.get("videoUrl") || ""),
          thumbnailUrl:
            thumbUpload?.publicUrl || String(data.get("thumbnailUrl") || ""),
          r2VideoKey:
            videoUpload?.key ||
            (String(data.get("videoUrl") || "") === initial?.videoUrl
              ? initial?.r2VideoKey
              : undefined),
          r2ThumbnailKey:
            thumbUpload?.key ||
            (String(data.get("thumbnailUrl") || "") === initial?.thumbnailUrl
              ? initial?.r2ThumbnailKey
              : undefined),
          sourceProvider: twitterImport?.sourceProvider,
          sourcePageUrl: twitterImport?.sourceUrl,
          sourceMediaUrl: twitterImport?.video.publicUrl,
          seoTitle: String(data.get("seoTitle") || ""),
          seoDescription: String(data.get("seoDescription") || ""),
          seoKeywords,
          actressIds: actresses
            .map((item) => item.id)
            .filter((id) => !id.startsWith("custom:")),
          workId: work[0]?.id?.startsWith("custom:") ? null : work[0]?.id,
          workTitle: work[0]?.id?.startsWith("custom:")
            ? work[0].title || work[0].name
            : String(data.get("workTitle") || ""),
          workType: data.get("workType") === "TV_SHOW" ? "TV_SHOW" : "MOVIE",
          workDescription: String(data.get("workDescription") || ""),
          tags: tagNames,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Unable to save catalogue item.");
      toast.success(
        status === "READY"
          ? `Published: ${payload.publicPath || "catalogue updated"}. Sitemaps refreshed.`
          : "Saved as draft",
      );
      form.reset();
      setActresses([]);
      setWork([]);
      setTags([]);
      setVideoFile(null);
      setThumbFile(null);
      setDuration(null);
      setSourceMode("file");
      setWorkType("MOVIE");
      close();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/65 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        disabled={busy}
        onClick={close}
        aria-label="Close editor"
      />
      <aside className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              {initial ? "Edit" : "Add"} {kind === "short" ? "Short" : "video"}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Upload to R2, save metadata to Supabase, publish when ready.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {!options?.readiness.r2 && (
          <p className="mt-5 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            R2 upload is not fully configured. You can still save using public
            media URLs, or configure R2 env keys first.
          </p>
        )}
        <form ref={formRef} onSubmit={submit} className="mt-6 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {initial || initialKind ? (
              <div className="block text-sm font-medium">
                Type
                <div className="mt-2 flex h-11 items-center rounded-xl border border-white/10 bg-zinc-900 px-3">
                  {kind === "short" ? "Short / vertical" : "Normal video"}
                </div>
              </div>
            ) : (
              <ChoicePills
                label="Type"
                value={kind}
                onChange={(nextKind) => {
                  setKind(nextKind);
                  if (nextKind === "video") setSourceMode("file");
                }}
                choices={[
                  { value: "video", label: "Normal video" },
                  { value: "short", label: "Short", hint: "Vertical or landscape" },
                ]}
              />
            )}
            <label className="block text-sm font-medium">
              Year
              <input
                name="year"
                defaultValue={initial?.year ?? ""}
                type="number"
                min={1900}
                max={2100}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]"
              />
            </label>
            <div className="sm:col-span-3">
              <ChoicePills
                label="Publish status"
                value={status}
                onChange={setStatus}
                choices={[
                  { value: "DRAFT", label: "Draft" },
                  { value: "READY", label: "Published" },
                  { value: "PROCESSING", label: "Processing" },
                  { value: "HIDDEN", label: "Hidden" },
                  { value: "FAILED", label: "Failed" },
                ]}
              />
            </div>
          </div>
          <label className="block text-sm font-medium">
            Title
            <input
              name="title"
              defaultValue={initial?.title ?? ""}
              required
              maxLength={180}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]"
            />
          </label>
          <label className="block text-sm font-medium">
            Description
            <textarea
              name="description"
              defaultValue={initial?.description ?? ""}
              required
              rows={4}
              maxLength={1200}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm outline-none focus:border-[#ff2d78]"
              placeholder="Scene summary, movie/series context, useful SEO copy..."
            />
          </label>
          {kind === "short" && (
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
              <p className="text-sm font-semibold">Person shown</p>
              <p className="mt-1 text-xs text-zinc-500">Link a known actress, or use an explicitly adult unidentified person. AI never invents an identity.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setShortSubject("actress")} className={cn("rounded-xl border px-4 py-3 text-left text-sm", shortSubject === "actress" ? "border-[#ff2d78] bg-[#ff2d78]/10 text-white" : "border-white/10 bg-black/20 text-zinc-400")}>Known actress</button>
                <button type="button" onClick={() => { setShortSubject("random"); setActresses([]); }} className={cn("rounded-xl border px-4 py-3 text-left text-sm", shortSubject === "random" ? "border-[#ff2d78] bg-[#ff2d78]/10 text-white" : "border-white/10 bg-black/20 text-zinc-400")}>Unidentified adult woman</button>
              </div>
            </div>
          )}
          {(kind === "video" || shortSubject === "actress") && (
            <>
              <button
                type="button"
                onClick={addActress}
                className="inline-flex items-center gap-2 text-sm text-[#ff73aa]"
              >
                <UserPlus className="h-4 w-4" /> Add a new actress
              </button>
              <SelectBox
                lookupKind="actress"
                label={kind === "short" ? "Actress (optional only when Random is selected)" : "Actresses"}
                placeholder="Select actresses"
                options={options?.actresses ?? []}
                selected={actresses}
                onChange={setActresses}
                multiple
              />
            </>
          )}
          <SelectBox
            lookupKind="work"
            label="Movie / TV series"
            placeholder="Select existing work or type a new one"
            options={options?.works ?? []}
            selected={work}
            onChange={setWork}
            allowCustom
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <input type="hidden" name="workType" value={workType} />
              <ChoicePills
                label="New work type"
                value={workType}
                onChange={setWorkType}
                choices={[
                  { value: "MOVIE", label: "Movie" },
                  { value: "TV_SHOW", label: "TV series" },
                ]}
              />
            </div>
            <label className="block text-sm font-medium">
              Season
              <input
                name="seasonNumber"
                defaultValue={initial?.seasonNumber ?? ""}
                type="number"
                min={0}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]"
              />
            </label>
            <label className="block text-sm font-medium">
              Episode
              <input
                name="episodeNumber"
                defaultValue={initial?.episodeNumber ?? ""}
                type="number"
                min={0}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]"
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            New work title override
            <input
              name="workTitle"
              maxLength={180}
              placeholder="Only needed when not selecting existing work"
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]"
            />
          </label>
          <label className="block text-sm font-medium">
            Work description
            <textarea
              name="workDescription"
              rows={3}
              maxLength={600}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm outline-none focus:border-[#ff2d78]"
            />
          </label>
          <SelectBox
            lookupKind="tag"
            label="Tags"
            placeholder="Select or add tags"
            options={options?.tags ?? []}
            selected={tags}
            onChange={setTags}
            multiple
            allowCustom
          />
          {kind === "short" && (
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
              <p className="text-sm font-semibold">AI short metadata</p>
              <p className="mt-1 text-xs text-zinc-500">
                Visible details மட்டும் எழுதுங்கள். AI focused title, clean description,
                and 3–7 useful keywords மட்டும் தரும்—clips, shorts, trending, reels மாதிரி filler வராது.
              </p>
              <textarea
                value={shortBrief}
                onChange={(event) => setShortBrief(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Example: Sydney Sweeney in a black dress at an event, bikini scene, interview moment. Unknown person: adult woman hot butt video."
                className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm outline-none focus:border-[#ff2d78]"
              />
              <button
                type="button"
                onClick={autofillShortMetadata}
                disabled={aiBusy}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#ff2d78] px-4 text-sm font-semibold text-white hover:bg-[#ff4b8d] disabled:cursor-wait disabled:opacity-60"
              >
                {aiBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SearchCheck className="h-4 w-4" />
                )}{" "}
                AI autofill metadata
              </button>
            </div>
          )}
          {kind === "short" && (
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
              <p className="text-sm font-semibold">Short source</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSourceMode("file")}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left text-sm transition",
                    sourceMode === "file"
                      ? "border-[#ff2d78] bg-[#ff2d78]/10 text-white"
                      : "border-white/10 bg-black/20 text-zinc-400 hover:bg-white/5",
                  )}
                >
                  <FileVideo2 className="mb-2 h-4 w-4" /> Local upload
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSourceMode("twitter");
                    setVideoFile(null);
                    setThumbFile(null);
                  }}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left text-sm transition",
                    sourceMode === "twitter"
                      ? "border-[#ff2d78] bg-[#ff2d78]/10 text-white"
                      : "border-white/10 bg-black/20 text-zinc-400 hover:bg-white/5",
                  )}
                >
                  <ExternalLink className="mb-2 h-4 w-4" /> Twitter/X link
                </button>
              </div>
            </div>
          )}
          {sourceMode === "file" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Video file
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                  onChange={(event) =>
                    setVideoFile(event.target.files?.[0] ?? null)
                  }
                  className="mt-2 block w-full rounded-xl border border-dashed border-white/15 p-4 text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-medium file:text-black"
                />
                {duration ? (
                  <span className="mt-2 block text-xs text-zinc-500">
                    Detected duration: {duration}s
                  </span>
                ) : null}
              </label>
              <label className="block text-sm font-medium">
                Thumbnail
                <input
                  type="file"
                  accept="image/webp,image/jpeg,image/png"
                  onChange={(event) => {
                    setThumbnailMode("manual");
                    setThumbFile(event.target.files?.[0] ?? null);
                  }}
                  className="mt-2 block w-full rounded-xl border border-dashed border-white/15 p-4 text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-medium file:text-black"
                />
                {thumbFile ? (
                  <span className="mt-2 block text-xs text-emerald-300">
                    {thumbnailMode === "auto"
                      ? "Auto thumbnail ready"
                      : "Manual thumbnail selected"}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setThumbnailMode("auto")}
                  className="mt-2 inline-flex items-center gap-2 text-xs text-[#ff73aa] hover:underline"
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Use auto thumbnail
                </button>
              </label>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-4">
              <label className="block text-sm font-medium">
                Twitter/X video link
                <input
                  name="twitterUrl"
                  type="url"
                  placeholder="https://x.com/user/status/..."
                  className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 outline-none focus:border-[#1d9bf0]"
                />
              </label>
              <p className="mt-2 text-xs text-sky-200/80">
                Localhost import uses yt-dlp, uploads video + thumbnail to R2,
                then deletes the temp file.
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm font-medium sm:col-span-2">
              Public video URL
              <input
                name="videoUrl"
                defaultValue={initial?.videoUrl ?? ""}
                placeholder="Optional if not uploading now"
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]"
              />
            </label>
            <label className="block text-sm font-medium">
              Duration seconds
              <input
                name="durationSeconds"
                type="number"
                min={0}
                value={duration ?? ""}
                onChange={(event) =>
                  setDuration(Number(event.target.value) || null)
                }
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]"
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Public thumbnail URL
            <input
              name="thumbnailUrl"
              defaultValue={initial?.thumbnailUrl ?? ""}
              placeholder="Optional if not uploading thumbnail"
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]"
            />
          </label>
          <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
            <p className="text-sm font-semibold">SEO fields</p>
            <div className="mt-4 space-y-3">
              <input
                name="seoTitle"
                defaultValue={initial?.seoTitle ?? ""}
                maxLength={95}
                placeholder="SEO title override"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-[#ff2d78]"
              />
              <textarea
                name="seoDescription"
                defaultValue={initial?.seoDescription ?? ""}
                maxLength={300}
                rows={3}
                placeholder="SEO description override"
                className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-[#ff2d78]"
              />
              <input
                name="seoKeywords"
                defaultValue={initial?.seoKeywords?.join(", ") ?? ""}
                placeholder="Comma separated keywords"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-[#ff2d78]"
              />
            </div>
          </div>
          <button
            disabled={busy}
            className="h-12 w-full rounded-xl bg-white text-sm font-semibold text-black hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />{" "}
                {sourceMode === "twitter" ? "Processing link..." : "Saving..."}
              </span>
            ) : status === "READY" ? (
              "Upload & publish"
            ) : (
              "Save draft"
            )}
          </button>
        </form>
      </aside>
    </div>
  );
}

function NewActressModal({
  open,
  close,
  refresh,
}: {
  open: boolean;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      const response = await fetch("/api/admin/catalog/actresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") || ""),
          seoDescription: String(data.get("description") || ""),
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Unable to create actress");
      toast.success(
        payload.existed ? "Actress already exists" : "Actress created",
      );
      close();
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create actress",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[140] flex justify-end bg-black/70 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={close}
        aria-label="Close actress editor"
      />
      <aside className="relative h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">Add new actress</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Creates a Supabase actress profile for future videos.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block text-sm font-medium">
            Actress name
            <input
              name="name"
              required
              maxLength={120}
              autoFocus
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]"
            />
          </label>
          <label className="block text-sm font-medium">
            SEO description
            <textarea
              name="description"
              maxLength={320}
              rows={4}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm outline-none focus:border-[#ff2d78]"
            />
          </label>
          <button
            disabled={busy}
            className="h-11 w-full rounded-xl bg-white text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-60"
          >
            {busy ? "Creating..." : "Create actress profile"}
          </button>
        </form>
      </aside>
    </div>
  );
}

function Overview({
  options,
  openCreate,
}: {
  options: OptionsPayload | null;
  openCreate: () => void;
}) {
  const stats = options?.stats;
  const ready = options?.readiness;
  return (
    <>
      <SectionHeader
        title="Production admin"
        description="Supabase catalogue, Cloudflare R2 upload and publishing workflow."
        action={
          <button
            onClick={openCreate}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" /> Add content
          </button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Videos"
          value={stats?.videoCount ?? "—"}
          note="Published non-short videos"
          icon={FileVideo2}
        />
        <Metric
          label="Actresses"
          value={stats?.actressCount ?? "—"}
          note="Public profiles with videos"
          icon={UsersRound}
        />
        <Metric
          label="Shorts"
          value={stats?.shortCount ?? "—"}
          note={
            ready?.shortsIndexable
              ? "Shorts page can be indexed"
              : "Shorts page noindex until published"
          }
          icon={Smartphone}
        />
        <Metric
          label="Tags"
          value={stats?.tagCount ?? "—"}
          note="Indexed tag archive coverage"
          icon={Tags}
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/70 p-5">
          <h2 className="font-semibold">System readiness</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              {
                label: "Supabase database",
                ok: ready?.database,
                note: "Connected through Prisma",
              },
              {
                label: "Cloudflare R2",
                ok: ready?.r2,
                note: "Required for direct admin upload",
              },
              {
                label: "Media domain",
                ok: ready?.mediaDomain,
                note: "Needed for public video URLs",
              },
              {
                label: "Shorts indexing",
                ok: ready?.shortsIndexable,
                note: "Enabled when at least one READY short exists",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-xl bg-white/[.025] p-3"
              >
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full",
                    item.ok
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-amber-500/10 text-amber-300",
                  )}
                >
                  {item.ok ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Activity className="h-4 w-4" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-zinc-500">{item.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="font-semibold">Recent admin records</h2>
            <p className="text-xs text-zinc-500">
              Latest Supabase catalogue writes
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {options?.recentVideos?.length ? (
              options.recentVideos.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <span className="grid h-11 w-16 shrink-0 place-items-center rounded-lg bg-white/5">
                    {item.isShort ? (
                      <Smartphone className="h-5 w-5 text-zinc-400" />
                    ) : (
                      <Film className="h-5 w-5 text-zinc-400" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {item.actresses.join(", ") || "No actress linked"}
                    </p>
                  </div>
                  <Status tone={item.status === "READY" ? "green" : "amber"}>
                    {item.status}
                  </Status>
                </div>
              ))
            ) : (
              <p className="px-5 py-12 text-center text-sm text-zinc-500">
                No admin records yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function VideosPanel({
  kind,
  onEdit,
  onCreate,
  revision,
}: {
  kind: "videos" | "shorts" | "all";
  onEdit: (video: AdminVideo) => void;
  onCreate: () => void;
  revision: number;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<{
    items: AdminVideo[];
    totalPages: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setLoading(true);
    });
    const params = new URLSearchParams({
      page: String(page),
      limit: "25",
      q: query,
      kind,
    });
    const timer = setTimeout(() => {
      fetch(`/api/admin/catalog/videos?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const json = await response.json();
          if (!response.ok)
            throw new Error(json.error || "Unable to load videos");
          setPayload(json);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            toast.error(
              error instanceof Error ? error.message : "Unable to load videos",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, page, query, revision]);
  return (
    <>
      <SectionHeader
        title={kind === "shorts" ? "Shorts" : "Videos"}
        description={kind === "shorts" ? "Vertical clips, AI metadata, optional actress linking and automatic sitemap publishing." : "Paginated Supabase admin table. Queries are limited and indexed."}
        action={<button type="button" onClick={onCreate} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black hover:bg-zinc-200"><Plus className="h-4 w-4" /> Add {kind === "shorts" ? "Short" : "video"}</button>}
      />
      <div className="mb-4 flex h-11 max-w-md items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-3">
        <Search className="h-4 w-4 text-zinc-500" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search title"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600"
        />
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70">
        {loading ? (
          <div className="grid place-items-center py-16 text-zinc-500">
            <Loader2 className="mb-2 h-5 w-5 animate-spin" />
            Loading...
          </div>
        ) : payload?.items.length ? (
          payload.items.map((video) => (
            <div
              key={video.id}
              className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0 hover:bg-white/[.025]"
            >
              <span className="grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/5">
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : video.isShort ? (
                  <Smartphone className="h-5 w-5 text-zinc-500" />
                ) : (
                  <FileVideo2 className="h-5 w-5 text-zinc-500" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{video.title}</p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {video.actresses.map((item) => item.name).join(", ") ||
                    "No actress"}
                  {video.work ? ` · ${video.work.title}` : ""}
                </p>
              </div>
              <Status
                tone={
                  video.status === "READY"
                    ? "green"
                    : video.status === "FAILED"
                      ? "red"
                      : "amber"
                }
              >
                {video.status}
              </Status>
              <button
                type="button"
                onClick={() => onEdit(video)}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/10"
              >
                Edit
              </button>
            </div>
          ))
        ) : (
          <p className="px-4 py-16 text-center text-sm text-zinc-500">
            No records found.
          </p>
        )}
      </div>
      {payload && payload.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-sm text-zinc-500">
            Page {page} / {payload.totalPages}
          </span>
          <button
            disabled={page >= payload.totalPages}
            onClick={() =>
              setPage((value) => Math.min(payload.totalPages, value + 1))
            }
            className="rounded-lg border border-white/10 px-3 py-2 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}

function DirectoryPanel({
  title,
  description,
  items,
  icon: Icon,
}: {
  title: string;
  description: string;
  items: Option[];
  icon: LucideIcon;
}) {
  return (
    <>
      <SectionHeader title={title} description={description} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/70 p-4"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-zinc-300">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {item.name || item.title || item.label}
              </p>
              <p className="text-xs text-zinc-500">
                {[
                  item.typeLabel,
                  item.releaseYear,
                  item.videoCount != null ? `${item.videoCount} videos` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || item.slug}
              </p>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-zinc-900/70 py-16 text-center text-sm text-zinc-500">
          No records loaded.
        </p>
      )}
    </>
  );
}

function OperationsPanel({
  section,
  options,
}: {
  section: Exclude<
    AdminSection,
    "overview" | "videos" | "actresses" | "shorts" | "works" | "tags"
  >;
  options: OptionsPayload | null;
}) {
  const copy = {
    media: {
      title: "Media storage",
      description: "R2 readiness, public media domain and upload health.",
      icon: HardDrive,
      items: [
        `R2 upload: ${options?.readiness.r2 ? "Ready" : "Not configured"}`,
        `Public media domain: ${options?.readiness.mediaDomain ? "Configured" : "Missing"}`,
        "Uploads use direct signed PUT URLs; media is not proxied through Workers.",
      ],
    },
    imports: {
      title: "Import queue",
      description: "Bulk import strategy for future videos.",
      icon: UploadCloud,
      items: [
        "Import JSON should write to Supabase in batches of 25.",
        "Validate duplicate slug, missing actress, missing media URL before publish.",
        "Keep failed rows downloadable for correction.",
      ],
    },
    seo: {
      title: "SEO control centre",
      description: "Indexing, sitemap and metadata strategy.",
      icon: SearchCheck,
      items: [
        "READY normal videos enter video sitemap.",
        "READY Shorts make /shorts indexable.",
        "DRAFT/HIDDEN records stay out of public indexes.",
      ],
    },
    settings: {
      title: "Settings",
      description: "Production setup summary.",
      icon: Settings,
      items: [
        "Admin endpoints are no-store and auth protected.",
        "Dropdown APIs return bounded results only.",
        "Public pages need DB-backed rendering for instant publish indexing.",
      ],
    },
  }[section];
  const Icon = copy.icon;
  return (
    <>
      <SectionHeader title={copy.title} description={copy.description} />
      <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-6">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#ff2d78]/20 to-violet-500/20 text-[#ff73aa]">
          <Icon className="h-6 w-6" />
        </span>
        <div className="mt-5 space-y-3">
          {copy.items.map((line) => (
            <div
              key={line}
              className="flex items-center gap-3 rounded-xl bg-white/[.025] px-4 py-3 text-sm text-zinc-300"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              {line}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function AdminConsolePro({ section }: { section: AdminSection }) {
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<"video" | "short" | null>(null);
  const [editing, setEditing] = useState<AdminVideo | null>(null);
  const [revision, setRevision] = useState(0);
  const [actressOpen, setActressOpen] = useState(false);
  const { data: options, loading, refresh } = useAdminOptions();

  const editVideo = (video: AdminVideo) => {
    setEditing(video);
    setCreateKind(video.isShort ? "short" : "video");
    setCreateOpen(true);
  };
  const openCreate = (kind: "video" | "short" | null = null) => {
    setEditing(null);
    setCreateKind(kind);
    setCreateOpen(true);
  };
  const refreshContent = async () => {
    await refresh();
    setRevision((value) => value + 1);
  };

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.replace("/admin/login");
    router.refresh();
  }

  const sidebar = (
    <>
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <LogoMark className="h-7 w-auto" />
        <Status tone="zinc">Admin</Status>
      </div>
      <nav className="space-y-1 p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = item.id === section;
          return (
            <Link
              key={item.id}
              href={item.id === "overview" ? "/admin" : `/admin/${item.id}`}
              onClick={() => setDrawer(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-white/10 p-3">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-[18px] w-[18px]" /> Sign out
        </button>
      </div>
    </>
  );

  const content = (() => {
    if (loading && !options)
      return (
        <div className="grid place-items-center py-24 text-zinc-500">
          <Loader2 className="mb-2 h-6 w-6 animate-spin" /> Loading admin...
        </div>
      );
    if (section === "overview")
      return (
        <Overview options={options} openCreate={() => openCreate(null)} />
      );
    if (section === "videos")
      return (
        <VideosPanel kind="videos" onEdit={editVideo} onCreate={() => openCreate("video")} revision={revision} />
      );
    if (section === "shorts")
      return (
        <VideosPanel kind="shorts" onEdit={editVideo} onCreate={() => openCreate("short")} revision={revision} />
      );
    if (section === "actresses")
      return (
        <DirectoryPanel
          title="Actresses"
          description="Searchable Supabase actress profiles loaded in bounded batches."
          items={options?.actresses ?? []}
          icon={UsersRound}
        />
      );
    if (section === "works")
      return (
        <DirectoryPanel
          title="Movies & series"
          description="Canonical works used by video pages and related-video matching."
          items={options?.works ?? []}
          icon={Clapperboard}
        />
      );
    if (section === "tags")
      return (
        <DirectoryPanel
          title="Tags"
          description="Controlled tags; keep thin tags unindexed on public pages."
          items={options?.tags ?? []}
          icon={Tags}
        />
      );
    if (section === "imports") return <ImportStudio />;
    return <OperationsPanel section={section} options={options} />;
  })();

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-zinc-950 lg:flex">
        {sidebar}
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/70"
            onClick={() => setDrawer(false)}
            aria-label="Close navigation"
          />
          <aside className="relative flex h-full w-72 flex-col bg-zinc-950">
            {sidebar}
          </aside>
        </div>
      )}
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center border-b border-white/10 bg-[#09090b]/90 px-4 backdrop-blur lg:left-64">
        <button
          onClick={() => setDrawer(true)}
          className="mr-2 grid h-10 w-10 place-items-center rounded-xl hover:bg-white/5 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden min-w-0 flex-1 items-center gap-2 text-sm text-zinc-500 sm:flex">
          <ShieldCheck className="h-4 w-4 text-emerald-400" /> Production admin
          · Supabase + R2
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setActressOpen(true)}
            className="hidden h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-zinc-300 hover:bg-white/5 sm:inline-flex"
          >
            <UserPlus className="h-4 w-4" /> Actress
          </button>
          <Link
            href="/"
            target="_blank"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-zinc-300 hover:bg-white/5"
          >
            View site <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <button
            onClick={() => openCreate(section === "shorts" ? "short" : section === "videos" ? "video" : null)}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-br from-[#ff2d78] to-violet-600 px-3 text-sm font-semibold"
            aria-label={section === "shorts" ? "Add Short" : section === "videos" ? "Add video" : "Add content"}
          >
            <Plus className="h-4 w-4" />{" "}
            <span className="hidden sm:inline">Add {section === "shorts" ? "Short" : section === "videos" ? "video" : "content"}</span>
          </button>
        </div>
      </header>
      <main className="px-4 pb-14 pt-24 sm:px-6 lg:ml-64 lg:px-8 xl:px-10">
        {content}
      </main>
      {createOpen && (
        <QuickAdd
          key={`${editing?.id ?? "new"}-${createKind ?? "choose"}`}
          open
          initial={editing}
          initialKind={createKind}
          close={() => {
            setCreateOpen(false);
            setEditing(null);
            setCreateKind(null);
          }}
          options={options}
          refresh={refreshContent}
          addActress={() => setActressOpen(true)}
        />
      )}
      <NewActressModal
        open={actressOpen}
        close={() => setActressOpen(false)}
        refresh={refresh}
      />
    </div>
  );
}
