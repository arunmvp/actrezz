"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  ExternalLink,
  FileVideo2,
  HardDrive,
  ImageIcon,
  LayoutDashboard,
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
  UsersRound,
  UserPlus,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/youtube/icons";
import { Thumb } from "@/components/youtube/basics";
import { CHANNELS, SHORTS, VIDEOS, channelById } from "@/lib/youtube/data";
import { formatDuration } from "@/lib/youtube/format";
import { cn } from "@/lib/utils";
import allActressNames from "@/lib/admin/all-actresses.generated.json";
import { Pagination, useUrlPage } from "@/components/youtube/Pagination";

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

type Draft = { id: string; title: string; kind: string; actress: string; status: string; mediaKey?: string; thumbnailKey?: string };

function ActressPicker({ names, selected, onSelect }: { names: string[]; selected: string; onSelect: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? names.filter((name) => name.toLowerCase().includes(needle)) : names;
    return filtered.slice(0, 80);
  }, [names, query]);

  return <div className="relative mt-2">
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900 px-3 text-left text-sm outline-none hover:border-white/20 focus:border-[#ff2d78]">
      <span className={cn("truncate", !selected && "text-zinc-500")}>{selected || "Choose an actress"}</span><ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
    </button>
    {open && <>
      <button type="button" aria-label="Close actress selector" className="fixed inset-0 z-[110] cursor-default" onClick={() => setOpen(false)} />
      <div className="absolute inset-x-0 top-12 z-[120] overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-3"><Search className="h-4 w-4 text-zinc-500" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${names.length.toLocaleString()} actresses`} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600" /></div>
        <div role="listbox" className="max-h-72 overflow-y-auto p-1">
          {matches.map((name) => <button type="button" role="option" aria-selected={selected === name} key={name} onClick={() => { onSelect(name); setOpen(false); setQuery(""); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/[.07] hover:text-white"><span className="truncate">{name}</span>{selected === name && <Check className="h-4 w-4 text-[#ff63a0]" />}</button>)}
          {matches.length === 0 && <p className="px-3 py-8 text-center text-sm text-zinc-500">No actress found.</p>}
        </div>
        {matches.length === 80 && <p className="border-t border-white/10 px-3 py-2 text-xs text-zinc-500">Type more letters to narrow the results.</p>}
      </div>
    </>}
  </div>;
}

function Status({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "amber" | "zinc" }) {
  const styles = tone === "green" ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20" : tone === "amber" ? "bg-amber-500/10 text-amber-300 ring-amber-500/20" : "bg-white/5 text-zinc-300 ring-white/10";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", styles)}>{children}</span>;
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: string | number; note: string; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-zinc-400">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-zinc-300"><Icon className="h-4.5 w-4.5" /></span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{note}</p>
    </div>
  );
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="mt-1 text-sm text-zinc-400">{description}</p></div>{action}</div>;
}

function Overview({ openCreate, actressCount }: { openCreate: () => void; actressCount: number }) {
  return (
    <>
      <SectionHeader title="Catalogue overview" description="Publishing health and the work that needs attention." action={<button onClick={openCreate} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black hover:bg-zinc-200"><Plus className="h-4 w-4" /> Add content</button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Videos" value={VIDEOS.length} note="Preview catalogue" icon={FileVideo2} />
        <Metric label="Actresses" value={actressCount.toLocaleString()} note={`${CHANNELS.length} curated public profiles`} icon={UsersRound} />
        <Metric label="Shorts" value={SHORTS.length} note="Vertical videos" icon={Smartphone} />
        <Metric label="SEO coverage" value="92%" note="Demo audit score" icon={BarChart3} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 className="font-semibold">Recently added</h2><p className="text-xs text-zinc-500">Latest catalogue records</p></div><Link href="/admin/videos" className="text-sm text-[#ff63a0] hover:underline">View all</Link></div>
          <div className="divide-y divide-white/5">{VIDEOS.slice(0, 5).map((video) => <div key={video.id} className="flex items-center gap-3 px-5 py-3"><div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg"><Thumb seed={video.thumbSeed} radius="rounded-none" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{video.title}</p><p className="mt-0.5 text-xs text-zinc-500">{channelById(video.channelId).name} · {formatDuration(video.durationSec)}</p></div><Status>Ready</Status></div>)}</div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-zinc-900/70 p-5">
          <h2 className="font-semibold">System readiness</h2>
          <div className="mt-5 space-y-4">
            {[{ label: "Admin protection", state: "Active", ok: true }, { label: "Next.js routes", state: "Healthy", ok: true }, { label: "Supabase database", state: "Connect later", ok: false }, { label: "Cloudflare R2", state: "Connect later", ok: false }].map((item) => <div key={item.label} className="flex items-center gap-3"><span className={cn("grid h-8 w-8 place-items-center rounded-full", item.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-300")}>{item.ok ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-zinc-500">{item.state}</p></div></div>)}
          </div>
        </section>
      </div>
    </>
  );
}

function VideosPanel({ drafts, openCreate }: { drafts: Draft[]; openCreate: () => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useUrlPage();
  const rows = useMemo(() => VIDEOS.filter((video) => video.title.toLowerCase().includes(query.toLowerCase())), [query]);
  const totalPages = Math.max(1, Math.ceil(rows.length / 50));
  const activePage = Math.min(page, totalPages);
  return (
    <>
      <SectionHeader title="Videos" description="Review metadata, publishing status and media links." action={<button onClick={openCreate} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black"><Plus className="h-4 w-4" /> New video</button>} />
      <div className="mb-4 flex h-11 max-w-md items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-3"><Search className="h-4 w-4 text-zinc-500" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1, true); }} placeholder="Search videos" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600" /></div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70">
        {drafts.map((draft) => <div key={draft.id} className="flex items-center gap-3 border-b border-white/5 bg-amber-500/[.04] px-4 py-3"><span className="grid h-11 w-16 place-items-center rounded-lg bg-amber-500/10"><FileVideo2 className="h-5 w-5 text-amber-300" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{draft.title}</p><p className="text-xs text-zinc-500">{draft.actress} · {draft.kind}</p></div><Status tone="amber">Staging draft</Status></div>)}
        {rows.slice((activePage - 1) * 50, activePage * 50).map((video) => <div key={video.id} className="group flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0 hover:bg-white/[.025]"><div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg"><Thumb seed={video.thumbSeed} src={video.thumbnailUrl} radius="rounded-none" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{video.title}</p><p className="mt-0.5 text-xs text-zinc-500">{channelById(video.channelId).name} · {video.category} · {formatDuration(video.durationSec)}</p></div><Status>Ready</Status><button onClick={() => toast("Editor activates after Supabase connection")} className="hidden rounded-lg px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/5 sm:block">Edit</button></div>)}
      </div>
      <Pagination page={activePage} totalPages={totalPages} onPageChange={setPage} />
    </>
  );
}

function ActressesPanel({ names, onCreate }: { names: string[]; onCreate: () => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useUrlPage();
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => names.filter((name) => !needle || name.toLowerCase().includes(needle)), [names, needle]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 60));
  const activePage = Math.min(page, totalPages);
  const known = useMemo(() => new Map(CHANNELS.map((person) => [person.name.toLowerCase(), person])), []);
  return <>
    <SectionHeader title="Actresses" description={`${names.length.toLocaleString()} names available. The 200 curated public profiles are marked live.`} action={<button onClick={onCreate} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black"><UserPlus className="h-4 w-4" /> New actress</button>} />
    <div className="mb-4 flex h-11 max-w-md items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-3"><Search className="h-4 w-4 text-zinc-500" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1, true); }} placeholder="Search all actresses" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600" /></div>
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70">
      {filtered.slice((activePage - 1) * 60, activePage * 60).map((name) => { const profile = known.get(name.toLowerCase()); return <div key={name} className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0 hover:bg-white/[.025]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 text-xs font-semibold">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name}</p><p className="text-xs text-zinc-500">{profile ? `${profile.videoCount} videos · public profile` : "Available for new catalogue records"}</p></div>{profile ? <Status>Live</Status> : <Status tone="zinc">Directory</Status>}<ChevronRight className="hidden h-4 w-4 text-zinc-600 sm:block" /></div>; })}
      {filtered.length === 0 && <p className="px-4 py-16 text-center text-sm text-zinc-500">No actress found.</p>}
    </div>
    <Pagination page={activePage} totalPages={totalPages} onPageChange={setPage} />
  </>;
}

function OperationsPanel({ section }: { section: Exclude<AdminSection, "overview" | "videos" | "actresses"> }) {
  const content: Record<typeof section, { title: string; description: string; icon: LucideIcon; items: string[] }> = {
    works: { title: "Movies & series", description: "Canonical titles, release years, descriptions and linked scenes.", icon: Clapperboard, items: ["Create one canonical record per movie or series", "Link every video to a work", "Detect duplicate title and year combinations"] },
    shorts: { title: "Shorts", description: "Manage vertical videos and publishing order.", icon: Smartphone, items: ["9:16 media validation", "Poster and autoplay preview", "Publish, schedule or hide"] },
    tags: { title: "Tags", description: "Controlled tags and genres without duplicate SEO pages.", icon: Tags, items: ["Merge duplicate tags", "Edit slug and SEO copy", "Hide thin archive pages"] },
    media: { title: "Media storage", description: "Cloudflare R2 files, thumbnails and health checks.", icon: HardDrive, items: ["Orphaned file detection", "Video and thumbnail URL validation", "Storage usage and failed transfer report"] },
    imports: { title: "Import queue", description: "Validate bulk metadata before it becomes public.", icon: UploadCloud, items: ["JSON import with dry run", "Duplicate detection", "Error rows downloadable for correction"] },
    seo: { title: "SEO control centre", description: "Indexing, metadata and sitemap quality checks.", icon: SearchCheck, items: ["Missing title and description report", "Canonical and structured-data validation", "Automatic sitemap inclusion after publish"] },
    settings: { title: "Settings", description: "Site, publishing and admin security configuration.", icon: Settings, items: ["Domain and media URL", "Default publishing rules", "Session security and audit settings"] },
  };
  const item = content[section];
  const Icon = item.icon;
  return <><SectionHeader title={item.title} description={item.description} /><div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-6"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#ff2d78]/20 to-violet-500/20 text-[#ff73aa]"><Icon className="h-6 w-6" /></span><h2 className="mt-5 font-semibold">Production workflow prepared</h2><div className="mt-4 space-y-3">{item.items.map((line) => <div key={line} className="flex items-center gap-3 rounded-xl bg-white/[.025] px-4 py-3 text-sm text-zinc-300"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />{line}</div>)}</div><p className="mt-5 text-sm text-amber-300">Write operations activate after Supabase and R2 credentials are connected.</p></div></>;
}

function NewActressModal({ open, close, add }: { open: boolean; close: () => void; add: (name: string) => void }) {
  if (!open) return null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    if (!name) return;
    add(name);
    form.reset();
    close();
    toast.success(`${name} added to the staging directory`);
  }
  return <div className="fixed inset-0 z-[140] flex justify-end bg-black/70 backdrop-blur-sm"><button type="button" className="absolute inset-0 cursor-default" onClick={close} aria-label="Close actress editor" /><aside className="relative h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-zinc-950 p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">Add new actress</h2><p className="mt-1 text-sm text-zinc-500">Create the profile first, then select it while adding videos.</p></div><button type="button" onClick={close} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white/5" aria-label="Close"><X className="h-5 w-5" /></button></div><form onSubmit={submit} className="mt-8 space-y-5"><label className="block text-sm font-medium">Actress name<input name="name" required maxLength={120} autoFocus className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]" /></label><label className="block text-sm font-medium">Profile image<input name="profile" type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full rounded-xl border border-dashed border-white/15 p-4 text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-medium file:text-black" /></label><label className="block text-sm font-medium">SEO description<textarea name="description" maxLength={320} rows={4} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm outline-none focus:border-[#ff2d78]" /></label><p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">This preview stores the new name in this admin session. Supabase connection will make create/edit operations permanent.</p><button className="h-11 w-full rounded-xl bg-white text-sm font-semibold text-black hover:bg-zinc-200">Create actress profile</button></form></aside></div>;
}

function QuickAdd({ open, close, add, actressNames, openNewActress }: { open: boolean; close: () => void; add: (draft: Draft) => void; actressNames: string[]; openNewActress: () => void }) {
  const [actress, setActress] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  async function uploadFile(file: File, kind: "video" | "thumbnail") {
    const response = await fetch("/api/admin/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, kind }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Upload setup failed");
    const upload = await fetch(payload.uploadUrl, { method: "PUT", body: file });
    if (!upload.ok) throw new Error(`R2 upload failed with ${upload.status}`);
    return payload.key as string;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actress) {
      toast.error("Choose an actress");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const videoFile = data.get("videoFile");
    const thumbnailFile = data.get("thumbnailFile");
    setBusy(true);
    try {
      let mediaKey: string | undefined;
      let thumbnailKey: string | undefined;
      if (videoFile instanceof File && videoFile.size > 0) {
        toast.info("Uploading video to R2");
        mediaKey = await uploadFile(videoFile, "video");
      }
      if (thumbnailFile instanceof File && thumbnailFile.size > 0) {
        thumbnailKey = await uploadFile(thumbnailFile, "thumbnail");
      }
      add({ id: `draft-${Date.now()}`, title: String(data.get("title")), kind: String(data.get("kind")), actress, status: mediaKey ? "UPLOADED" : "DRAFT", mediaKey, thumbnailKey });
      form.reset();
      setActress("");
      close();
      toast.success(mediaKey ? "Uploaded to R2 and added to staging" : "Added to the local staging preview");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  return <div className="fixed inset-0 z-[100] flex justify-end bg-black/65 backdrop-blur-sm"><button type="button" className="absolute inset-0 cursor-default" onClick={close} aria-label="Close editor" /><aside className="relative h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-zinc-950 p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">Add catalogue item</h2><p className="mt-1 text-sm text-zinc-500">Uploads media to R2 when credentials are available.</p></div><button type="button" onClick={close} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white/5" aria-label="Close"><X className="h-5 w-5" /></button></div><form onSubmit={submit} className="mt-8 space-y-5"><label className="block text-sm font-medium">Title<input name="title" required maxLength={160} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]" /></label><label className="block text-sm font-medium">Content type<select name="kind" className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 outline-none"><option>Video</option><option>Short</option></select></label><label className="block text-sm font-medium">Actress<ActressPicker names={actressNames} selected={actress} onSelect={setActress} /></label><button type="button" onClick={openNewActress} className="-mt-2 inline-flex items-center gap-2 text-xs font-medium text-[#ff63a0] hover:underline"><UserPlus className="h-3.5 w-3.5" /> Actress not listed? Add a new profile</button><label className="block text-sm font-medium">Movie / series<input name="work" maxLength={160} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 outline-none focus:border-[#ff2d78]" /></label><label className="block text-sm font-medium">Video file<input name="videoFile" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" className="mt-2 block w-full rounded-xl border border-dashed border-white/15 p-4 text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-medium file:text-black" /></label><label className="block text-sm font-medium">Thumbnail<input name="thumbnailFile" type="file" accept="image/webp,image/jpeg,image/png" className="mt-2 block w-full rounded-xl border border-dashed border-white/15 p-4 text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-medium file:text-black" /></label><p className="rounded-xl bg-white/[.035] px-3 py-2 text-xs leading-5 text-zinc-400">Public publish happens after media URL/domain is ready. Until then this creates an admin staging record.</p><button disabled={busy} className="h-11 w-full rounded-xl bg-white text-sm font-semibold text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Uploading..." : "Upload / add staging draft"}</button></form></aside></div>;
}

export function AdminConsole({ section }: { section: AdminSection }) {
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [actressCreateOpen, setActressCreateOpen] = useState(false);
  const [addedActresses, setAddedActresses] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const actressNames = useMemo(() => [...new Set([...addedActresses, ...allActressNames])].sort((a, b) => a.localeCompare(b)), [addedActresses]);

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.replace("/admin/login");
    router.refresh();
  }

  const sidebar = <><div className="flex h-16 items-center border-b border-white/10 px-5"><LogoMark className="h-7 w-auto" /><Status tone="zinc">Admin</Status></div><nav className="space-y-1 p-3">{nav.map((item) => { const Icon = item.icon; const active = item.id === section; return <Link key={item.id} href={item.id === "overview" ? "/admin" : `/admin/${item.id}`} onClick={() => setDrawer(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition", active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white")}><Icon className="h-[18px] w-[18px]" />{item.label}</Link>; })}</nav><div className="mt-auto border-t border-white/10 p-3"><button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut className="h-[18px] w-[18px]" /> Sign out</button></div></>;

  return <div className="min-h-screen bg-[#09090b] text-zinc-100"><aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-zinc-950 lg:flex">{sidebar}</aside>{drawer && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/70" onClick={() => setDrawer(false)} aria-label="Close navigation" /><aside className="relative flex h-full w-72 flex-col bg-zinc-950">{sidebar}</aside></div>}<header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center border-b border-white/10 bg-[#09090b]/90 px-4 backdrop-blur lg:left-64"><button onClick={() => setDrawer(true)} className="mr-2 grid h-10 w-10 place-items-center rounded-xl hover:bg-white/5 lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button><div className="hidden min-w-0 flex-1 items-center gap-2 text-sm text-zinc-500 sm:flex"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Protected admin session</div><div className="ml-auto flex items-center gap-2"><Link href="/" target="_blank" className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-zinc-300 hover:bg-white/5">View site <ExternalLink className="h-3.5 w-3.5" /></Link><button onClick={() => setCreateOpen(true)} className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#ff2d78] to-violet-600" aria-label="Add content"><Plus className="h-4 w-4" /></button></div></header><main className="px-4 pb-14 pt-24 sm:px-6 lg:ml-64 lg:px-8 xl:px-10">{section === "overview" ? <Overview openCreate={() => setCreateOpen(true)} actressCount={actressNames.length} /> : section === "videos" ? <VideosPanel drafts={drafts} openCreate={() => setCreateOpen(true)} /> : section === "actresses" ? <ActressesPanel names={actressNames} onCreate={() => setActressCreateOpen(true)} /> : <OperationsPanel section={section} />}</main><QuickAdd open={createOpen} close={() => setCreateOpen(false)} add={(draft) => setDrafts((items) => [draft, ...items])} actressNames={actressNames} openNewActress={() => setActressCreateOpen(true)} /><NewActressModal open={actressCreateOpen} close={() => setActressCreateOpen(false)} add={(name) => setAddedActresses((items) => [name, ...items])} /></div>;
}
