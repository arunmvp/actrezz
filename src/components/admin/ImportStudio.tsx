"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, CircleAlert, FileSearch, FolderOpen, Loader2, LockKeyhole, RefreshCw, Sparkles, UploadCloud } from "lucide-react";
import { toast } from "sonner";

type Scan = {
  localOnly: boolean;
  safeSeedReady?: boolean;
  folders: { videoFolder: string; metadataFolder: string; seedFolder: string; seedFingerprint: string; seedFile?: string; combinedSeedFile?: string; masterFile?: string };
  summary: { filesOnDisk: number; metadataVideos: number; matchedMetadata?: number; readyToPrepare: number; duplicates: number; needsReview: number };
  media: { videoFiles: number; unlinkedFiles: number; missingVideoFiles: number; missingThumbnails: number };
  metadata: { missingDescriptions: number; newActresses: number; newWorks: number; newTags: number };
  sourcePolicy: {
    descriptions: { provider: string; matched: number; needsReview: number };
    actressProfiles: { provider: string; verified: number; needsReview: number };
    seo: { missingTitles: number; missingDescriptions: number; missingKeywords: number };
  };
  samples: { ready: Array<{ id: string; title?: string; slug?: string }>; duplicates: Array<{ id: string; title?: string; slug?: string }>; review: Array<{ id: string; title?: string; reason: string }> };
};
type Job = { id: string; action: "build" | "prepare" | "stage" | "upload" | "publish"; status: "RUNNING" | "COMPLETE" | "FAILED"; videoFolder: string; metadataFolder: string; seedFolder?: string; seedFingerprint?: string; startedAt: string; finishedAt?: string; logs: string[]; error?: string };

const defaultFolder = "C:\\projects\\actrezz\\downloads";
const defaultMetadata = "C:\\projects\\celeb\\metadata_output";
const generatedSeedFolder = "C:\\projects\\actrezz\\data\\local-import-studio\\batch-seed";

function Step({ number, title, note, active, complete }: { number: number; title: string; note: string; active?: boolean; complete?: boolean }) {
  return <div className={`flex min-w-0 items-center gap-3 ${active ? "text-white" : "text-zinc-500"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${complete ? "bg-emerald-400 text-emerald-950" : active ? "bg-[#ff2d78] text-white" : "bg-white/5"}`}>{complete ? <CheckCircle2 className="h-4 w-4" /> : number}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{title}</p><p className="truncate text-xs text-zinc-500">{note}</p></div></div>;
}

function Metric({ label, value, tone = "zinc" }: { label: string; value: number; tone?: "zinc" | "green" | "amber" | "red" }) {
  const toneClass = { zinc: "text-white", green: "text-emerald-300", amber: "text-amber-300", red: "text-rose-300" }[tone];
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-500">{label}</p><p className={`mt-2 text-2xl font-semibold tracking-tight ${toneClass}`}>{value.toLocaleString()}</p></div>;
}

export function ImportStudio() {
  const [folder, setFolder] = useState(defaultFolder);
  const [metadataFolder, setMetadataFolder] = useState(defaultMetadata);
  const [loading, setLoading] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [publishApproved, setPublishApproved] = useState(false);
  const sampleColumns: Array<{ label: string; rows: Array<{ id: string; title?: string; reason?: string }>; tone: string }> = scan ? [
    { label: "Ready", rows: scan.samples.ready, tone: "text-emerald-300" },
    { label: "Duplicates", rows: scan.samples.duplicates, tone: "text-amber-300" },
    { label: "Needs review", rows: scan.samples.review, tone: "text-rose-300" },
  ] : [];

  async function analyze(metadataOverride?: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/imports/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder, metadataFolder: metadataOverride || metadataFolder }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Import analysis failed.");
      setScan(payload);
      setPublishApproved(false);
      toast.success("Batch analysis complete");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import analysis failed.");
    } finally { setLoading(false); }
  }

  async function refreshJobs() {
    try {
      const response = await fetch("/api/admin/imports/jobs", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setJobs(payload.jobs || []);
    } catch { /* The studio remains usable if a local dev server is restarting. */ }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshJobs(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const running = jobs.find((job) => job.status === "RUNNING");
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void refreshJobs(), 1500);
    return () => window.clearInterval(timer);
  }, [running?.id]);

  const batchJobs = useMemo(() => !scan ? [] : jobs.filter((job) => job.videoFolder === scan.folders.videoFolder && (job.seedFolder || job.metadataFolder) === scan.folders.seedFolder && job.seedFingerprint === scan.folders.seedFingerprint), [jobs, scan]);
  const completed = useMemo(() => new Set(batchJobs.filter((job) => job.status === "COMPLETE").map((job) => job.action)), [batchJobs]);
  // Never show a completed job from a different folder/seed pair. It is
  // particularly misleading after switching from a generated seed back to
  // the master catalogue, because that catalogue intentionally has no job
  // fingerprint until its safe batch seed has been built.
  const latestJob = batchJobs[0];
  const buildComplete = batchJobs.some((job) => job.action === "build" && job.status === "COMPLETE");
  useEffect(() => {
    if (!scan || scan.safeSeedReady !== false || !buildComplete || running) return;
    setMetadataFolder(generatedSeedFolder);
    void analyze(generatedSeedFolder);
  }, [buildComplete, running?.id, scan?.safeSeedReady]);
  async function start(action: Job["action"]) {
    if (!scan || running) return;
    try {
      const response = await fetch("/api/admin/imports/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, videoFolder: scan.folders.videoFolder, metadataFolder: scan.folders.metadataFolder, seedFolder: scan.folders.seedFolder }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to start this action.");
      setJobs((current) => [payload.job, ...current]);
      toast.success(`${action[0].toUpperCase()}${action.slice(1)} started locally`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to start this action."); }
  }

  return <>
    <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff73aa]">Localhost only</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Import Studio</h1><p className="mt-1 max-w-2xl text-sm text-zinc-400">Review a folder before any R2 upload or Supabase publish. Existing catalogue records are protected by default.</p></div>
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300"><LockKeyhole className="h-3.5 w-3.5" /> Local media never goes through the browser</span>
    </div>

    <div className="mb-6 grid gap-3 rounded-2xl border border-white/10 bg-zinc-900/70 p-4 lg:grid-cols-4">
      <Step number={1} title="Choose folders" note="Local disk only" active={!scan} complete={Boolean(scan)} />
      <Step number={2} title="Analyze batch" note="Duplicates + metadata" active={Boolean(scan)} complete={Boolean(scan)} />
      <Step number={3} title="Prepare & upload" note="R2 verification" active={Boolean(running || completed.has("prepare") || completed.has("stage") || completed.has("upload"))} complete={completed.has("upload")} />
      <Step number={4} title="Publish" note="DB + cache refresh" active={completed.has("upload")} complete={completed.has("publish")} />
    </div>

    <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label className="block"><span className="mb-2 block text-xs font-medium text-zinc-400">Video folder</span><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 focus-within:border-[#ff2d78]/60"><FolderOpen className="h-4 w-4 shrink-0 text-zinc-500" /><input value={folder} onChange={(event) => setFolder(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" spellCheck={false} /></div></label>
        <label className="block"><span className="mb-2 block text-xs font-medium text-zinc-400">Metadata folder</span><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 focus-within:border-[#ff2d78]/60"><FileSearch className="h-4 w-4 shrink-0 text-zinc-500" /><input value={metadataFolder} onChange={(event) => setMetadataFolder(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" spellCheck={false} /></div></label>
        <button type="button" onClick={() => void analyze()} disabled={loading} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#ff2d78] to-violet-600 px-5 text-sm font-semibold disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{loading ? "Analyzing…" : "Analyze batch"}</button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">1. Analyze local files. 2. Build approved metadata. 3. Prepare, upload, and publish.</p>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-zinc-300"><span className="text-zinc-500">Descriptions</span><br /><span className="font-medium text-[#ff9bc2]">VideoCelebs facts → original Actrezz copy</span></div>
        <div className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-zinc-300"><span className="text-zinc-500">Actress portraits</span><br /><span className="font-medium text-[#ff9bc2]">Verified AZNude only</span></div>
        <div className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-zinc-300"><span className="text-zinc-500">Thumbnails</span><br /><span className="font-medium text-[#ff9bc2]">Generated locally → R2</span></div>
      </div>
    </section>

    {!scan && <div className="mt-6 grid min-h-64 place-items-center rounded-3xl border border-dashed border-white/10 bg-zinc-900/35 p-8 text-center"><div><UploadCloud className="mx-auto h-8 w-8 text-zinc-600" /><p className="mt-3 font-medium text-zinc-300">Ready for a local batch</p><p className="mt-1 max-w-md text-sm text-zinc-500">Analyze first. Nothing will upload, create an actress, or modify production during this step.</p></div></div>}

    {scan && <div className="mt-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-3"><Metric label="Videos found" value={scan.summary.filesOnDisk} /><Metric label={scan.safeSeedReady === false ? "Metadata matched" : "Ready to prepare"} value={scan.safeSeedReady === false ? (scan.summary.matchedMetadata ?? 0) : scan.summary.readyToPrepare} tone="green" /><Metric label="Already in catalogue" value={scan.summary.duplicates} tone="amber" /></div>
      {scan.safeSeedReady === false && <div className="rounded-2xl border border-[#ff2d78]/30 bg-[#ff2d78]/5 px-4 py-4"><p className="font-medium text-white">Next: build approved metadata</p><p className="mt-1 text-sm leading-6 text-zinc-300">All matched files now need VideoCelebs-backed descriptions, SEO fields, and verified AZNude portrait checks. This stays local and does not upload or publish.</p></div>}
      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-3xl border border-white/10 bg-zinc-900/70 p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Batch checks</h2><p className="mt-1 text-sm text-zinc-500">Safe results from the local folder and current catalogue.</p></div><span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">Read-only</span></div><div className="mt-5 grid gap-2 text-sm sm:grid-cols-2"><p className="rounded-xl bg-white/[.035] px-3 py-3 text-zinc-300">{scan.media.missingVideoFiles} metadata items missing video files</p><p className="rounded-xl bg-white/[.035] px-3 py-3 text-zinc-300">{scan.media.unlinkedFiles} local files without metadata</p><p className="rounded-xl bg-white/[.035] px-3 py-3 text-zinc-300">{scan.media.missingThumbnails} thumbnails need preparation</p><p className="rounded-xl bg-white/[.035] px-3 py-3 text-zinc-300">{scan.metadata.missingDescriptions} descriptions need review</p><p className="rounded-xl bg-white/[.035] px-3 py-3 text-zinc-300">{scan.metadata.newActresses} new actresses to create</p><p className="rounded-xl bg-white/[.035] px-3 py-3 text-zinc-300">{scan.metadata.newWorks} new movies / series · {scan.metadata.newTags} new tags</p></div></section>
        <section className="rounded-3xl border border-[#ff2d78]/20 bg-gradient-to-br from-[#ff2d78]/10 to-violet-500/10 p-5"><CircleAlert className="h-5 w-5 text-[#ff73aa]" /><h2 className="mt-4 font-semibold">Controlled publishing</h2><p className="mt-1 text-sm leading-6 text-zinc-400">Every step has its own job log. Duplicate rows stay excluded, portraits are never generated from video thumbnails, and only media verified in R2 can publish.</p><p className="mt-3 text-xs leading-5 text-zinc-400">New actresses without a verified portrait stay as initials. A video thumbnail can never become a profile photo.</p><div className="mt-4 rounded-xl bg-black/20 px-3 py-2 text-xs leading-5 text-zinc-400">After publish: homepage latest cards, notifications, search, related videos, sitemap, video sitemap and IndexNow refresh automatically. Edge cache refresh is reported in the job log.</div></section>
      </div>
      <section className="rounded-3xl border border-white/10 bg-zinc-900/70 p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Source & SEO policy</h2><p className="mt-1 text-sm text-zinc-500">These checks keep new pages consistent with the existing catalogue.</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${scan.sourcePolicy.descriptions.needsReview || scan.sourcePolicy.actressProfiles.needsReview || scan.sourcePolicy.seo.missingTitles || scan.sourcePolicy.seo.missingDescriptions || scan.sourcePolicy.seo.missingKeywords ? "bg-amber-400/10 text-amber-300" : "bg-emerald-400/10 text-emerald-300"}`}>{scan.sourcePolicy.descriptions.needsReview || scan.sourcePolicy.actressProfiles.needsReview ? "Review required" : "Policy ready"}</span></div><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-500">Descriptions · {scan.sourcePolicy.descriptions.provider}</p><p className="mt-2 text-lg font-semibold text-white">{scan.sourcePolicy.descriptions.matched.toLocaleString()} verified</p><p className="mt-1 text-xs text-zinc-500">{scan.sourcePolicy.descriptions.needsReview} source mismatches</p></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-500">Profiles · {scan.sourcePolicy.actressProfiles.provider}</p><p className="mt-2 text-lg font-semibold text-white">{scan.sourcePolicy.actressProfiles.verified.toLocaleString()} verified</p><p className="mt-1 text-xs text-zinc-500">{scan.sourcePolicy.actressProfiles.needsReview} need portrait review</p></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-500">SEO fields</p><p className="mt-2 text-lg font-semibold text-white">{scan.sourcePolicy.seo.missingTitles + scan.sourcePolicy.seo.missingDescriptions + scan.sourcePolicy.seo.missingKeywords} missing</p><p className="mt-1 text-xs text-zinc-500">Title, description and keywords are checked</p></div></div>{(scan.sourcePolicy.descriptions.needsReview || scan.sourcePolicy.seo.missingTitles || scan.sourcePolicy.seo.missingDescriptions || scan.sourcePolicy.seo.missingKeywords) ? <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-200">Rebuild the production-safe metadata seed with the approved source policy before staging; this batch will not be allowed to publish incomplete SEO data.</p> : null}</section>
      <section className="rounded-3xl border border-white/10 bg-zinc-900/70 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-semibold">Run the batch</h2><p className="mt-1 text-sm text-zinc-500">Steps run locally in the background. Closing the browser does not cancel the active job.</p></div><button type="button" onClick={() => void refreshJobs()} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-medium text-zinc-300 hover:bg-white/5"><RefreshCw className="h-3.5 w-3.5" /> Refresh log</button></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{scan.safeSeedReady === false && <button type="button" disabled={Boolean(running)} onClick={() => void start("build")} className="rounded-2xl border border-[#ff2d78]/40 bg-[#ff2d78]/10 p-4 text-left transition hover:border-[#ff2d78] disabled:cursor-not-allowed disabled:opacity-45"><span className="text-xs font-semibold text-[#ff73aa]">NEXT · METADATA</span><p className="mt-2 text-sm font-semibold">Build safe metadata</p><p className="mt-1 text-xs leading-5 text-zinc-400">Create the local VideoCelebs/AZNude-checked batch seed. No upload or publish.</p></button>}<button type="button" disabled={scan.safeSeedReady === false || Boolean(running)} onClick={() => void start("prepare")} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-[#ff2d78]/50 disabled:cursor-not-allowed disabled:opacity-45"><span className="text-xs font-semibold text-[#ff73aa]">1 · LOCAL ASSETS</span><p className="mt-2 text-sm font-semibold">Prepare thumbnails</p><p className="mt-1 text-xs leading-5 text-zinc-500">Rebuild the batch catalog and create missing WebP thumbnails.</p></button><button type="button" disabled={scan.safeSeedReady === false || !completed.has("prepare") || Boolean(running)} onClick={() => void start("stage")} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-[#ff2d78]/50 disabled:cursor-not-allowed disabled:opacity-45"><span className="text-xs font-semibold text-[#ff73aa]">2 · DATABASE</span><p className="mt-2 text-sm font-semibold">Stage safe drafts</p><p className="mt-1 text-xs leading-5 text-zinc-500">Create only new records as PROCESSING; nothing public yet.</p></button><button type="button" disabled={scan.safeSeedReady === false || !completed.has("stage") || Boolean(running)} onClick={() => void start("upload")} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-[#ff2d78]/50 disabled:cursor-not-allowed disabled:opacity-45"><span className="text-xs font-semibold text-[#ff73aa]">3 · R2</span><p className="mt-2 text-sm font-semibold">Upload & verify</p><p className="mt-1 text-xs leading-5 text-zinc-500">Upload only missing objects, then verify video range + thumbnail.</p></button><label className="rounded-2xl border border-white/10 bg-black/20 p-4"><span className="text-xs font-semibold text-[#ff73aa]">4 · PUBLIC</span><p className="mt-2 text-sm font-semibold">Publish verified</p><p className="mt-1 text-xs leading-5 text-zinc-500">Updates public feeds and indexing after explicit approval.</p><span className="mt-3 flex items-start gap-2 text-xs text-zinc-400"><input type="checkbox" checked={publishApproved} onChange={(event) => setPublishApproved(event.target.checked)} className="mt-0.5 accent-[#ff2d78]" />I reviewed this batch</span><button type="button" disabled={scan.safeSeedReady === false || !completed.has("upload") || !publishApproved || Boolean(running)} onClick={() => void start("publish")} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#ff2d78] to-violet-600 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"><UploadCloud className="h-3.5 w-3.5" /> Publish</button></label></div>{latestJob && <div className={`mt-5 rounded-2xl border p-4 ${latestJob.status === "FAILED" ? "border-rose-400/20 bg-rose-400/5" : latestJob.status === "COMPLETE" ? "border-emerald-400/20 bg-emerald-400/5" : "border-amber-400/20 bg-amber-400/5"}`}><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{latestJob.action[0].toUpperCase()}{latestJob.action.slice(1)} · {latestJob.status.toLowerCase()}</p><span className="text-xs text-zinc-500">{new Date(latestJob.startedAt).toLocaleTimeString()}</span></div>{latestJob.error && <p className="mt-2 text-xs text-rose-300">{latestJob.error}</p>}<pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-[11px] leading-5 text-zinc-400">{latestJob.logs.join("\n")}</pre></div>}</section>
      <section className="rounded-3xl border border-white/10 bg-zinc-900/70 p-5"><h2 className="font-semibold">Review sample</h2><div className="mt-4 grid gap-4 lg:grid-cols-3">{sampleColumns.map(({ label, rows, tone }) => <div key={label} className="min-w-0 rounded-2xl bg-black/20 p-3"><p className={`mb-2 text-xs font-semibold ${tone}`}>{label}</p>{rows.length ? rows.map((row) => <div key={`${label}-${row.id}`} className="border-t border-white/5 py-2 first:border-0 first:pt-0"><p className="truncate text-xs text-zinc-200">{row.title || row.id}</p>{row.reason && <p className="mt-0.5 text-[11px] text-zinc-500">{row.reason}</p>}</div>) : <p className="text-xs text-zinc-500">None</p>}</div>)}</div></section>
    </div>}
  </>;
}
