"use client";

import { CalendarDays, ChevronDown, Clapperboard, Film, Flame, Home, Info, Tags, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShortsLogo } from "./icons";
import { useYT, viewHref, type View } from "@/store/youtube-store";
import { cn } from "@/lib/utils";

type ItemProps = { icon: React.ReactNode; label: string; href: string; active?: boolean; onClick: () => void; compact?: boolean };

function Item({ icon, label, href, active, onClick, compact }: ItemProps) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onClick();
  };
  if (compact) return <a href={href} onClick={handleClick} className={cn("flex w-full flex-col items-center gap-1 rounded-[10px] px-1 py-4 hover:bg-yt-hover", active && "bg-yt-hover")}>{icon}<span className="text-[10px] leading-3 text-yt-text">{label}</span></a>;
  return <a href={href} onClick={handleClick} className={cn("flex w-full items-center gap-6 rounded-[10px] px-3 py-2.5 text-sm hover:bg-yt-hover", active && "bg-yt-hover font-medium")}>{icon}<span className="flex-1 truncate text-left text-base font-normal text-yt-text">{label}</span></a>;
}

function Divider() { return <hr className="my-3 border-yt-border/60" />; }
function SectionLabel({ children }: { children: React.ReactNode }) { return <h3 className="px-3 pb-1 pt-2 text-base font-medium text-yt-text">{children}</h3>; }

function SidebarContent({ onNavigate }: { onNavigate: (view: View) => void }) {
  const view = useYT((state) => state.view);
  const router = useRouter();
  const [pornOpen, setPornOpen] = useState(true);
  return <div className="pb-4 pt-3">
    <Item icon={<Home className="h-6 w-6" />} label="Home" href={viewHref({ type: "home" })} active={view.type === "home"} onClick={() => onNavigate({ type: "home" })} />
    <Item icon={<Flame className="h-6 w-6" />} label="Trending" href={viewHref({ type: "trending" })} active={view.type === "trending"} onClick={() => onNavigate({ type: "trending" })} />
    <div className="mt-1">
      <button type="button" onClick={() => setPornOpen((open) => !open)} aria-expanded={pornOpen} className="flex w-full items-center gap-6 rounded-[10px] px-3 py-2.5 text-sm text-yt-text hover:bg-yt-hover">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-[#ff2d78]/15 text-sm font-bold text-[#ff5b95]">18</span><span className="flex-1 text-left text-base">Porn</span><ChevronDown className={cn("h-4 w-4 transition-transform", !pornOpen && "-rotate-90")} />
      </button>
      {pornOpen && <div className="ml-4 border-l border-yt-border/70 py-1 pl-2">
        <Item icon={<ShortsLogo className="h-5 w-5" />} label="Shorties" href={viewHref({ type: "shorts" })} active={view.type === "shorts"} onClick={() => onNavigate({ type: "shorts" })} />
      </div>}
    </div>
    <Divider /><SectionLabel>Browse</SectionLabel>
    <Item icon={<UsersRound className="h-6 w-6" />} label="Actresses" href={viewHref({ type: "actresses" })} active={view.type === "actresses" || view.type === "channel"} onClick={() => onNavigate({ type: "actresses" })} />
    <Item icon={<Film className="h-6 w-6" />} label="Movies" href={viewHref({ type: "directory", kind: "movies" })} active={(view.type === "directory" && view.kind === "movies") || (view.type === "taxonomy" && view.kind === "movie")} onClick={() => onNavigate({ type: "directory", kind: "movies" })} />
    <Item icon={<Clapperboard className="h-6 w-6" />} label="TV Series" href={viewHref({ type: "directory", kind: "tv-series" })} active={(view.type === "directory" && view.kind === "tv-series") || (view.type === "taxonomy" && view.kind === "tv-series")} onClick={() => onNavigate({ type: "directory", kind: "tv-series" })} />
    <Item icon={<CalendarDays className="h-6 w-6" />} label="Years" href={viewHref({ type: "directory", kind: "years" })} active={(view.type === "directory" && view.kind === "years") || (view.type === "taxonomy" && view.kind === "year")} onClick={() => onNavigate({ type: "directory", kind: "years" })} />
    <Item icon={<Tags className="h-6 w-6" />} label="Tags & genres" href={viewHref({ type: "directory", kind: "tags" })} active={(view.type === "directory" && view.kind === "tags") || (view.type === "taxonomy" && view.kind === "tag")} onClick={() => onNavigate({ type: "directory", kind: "tags" })} />
    <Divider />
    <Item icon={<Info className="h-6 w-6" />} label="About" href="/about" onClick={() => router.push("/about")} />
    <Divider /><div className="flex flex-wrap gap-x-2 gap-y-1 px-3 text-[11px] font-medium leading-4 text-yt-text2">
      <a className="hover:text-yt-text hover:underline" href="/about">About</a>
      <a className="hover:text-yt-text hover:underline" href="/copyright">Copyright</a>
      <a className="hover:text-yt-text hover:underline" href="/dmca">DMCA</a>
      <a className="hover:text-yt-text hover:underline" href="/2257">2257</a>
      <a className="hover:text-yt-text hover:underline" href="/terms">Terms</a>
      <a className="hover:text-yt-text hover:underline" href="/privacy">Privacy</a>
      <p className="mt-2 w-full font-light">© 2026 Actrezz.online</p>
    </div>
  </div>;
}

export function Sidebar() {
  const open = useYT((state) => state.sidebarOpen);
  const view = useYT((state) => state.view);
  const navigate = useYT((state) => state.navigate);
  if (view.type === "watch" || view.type === "shorts") return null;
  if (open) return <aside className="fixed left-0 top-14 z-30 hidden h-[calc(100vh-56px)] w-60 overflow-hidden bg-yt-bg px-3 pb-6 pt-2 md:block"><SidebarContent onNavigate={navigate} /></aside>;
  return <aside className="fixed left-0 top-14 z-30 hidden h-[calc(100vh-56px)] w-[72px] flex-col items-center overflow-hidden bg-yt-bg px-1 pt-3 md:flex"><Item compact icon={<Home className="h-6 w-6" />} label="Home" href={viewHref({ type: "home" })} active={view.type === "home"} onClick={() => navigate({ type: "home" })} /><Item compact icon={<ShortsLogo className="h-6 w-6" />} label="Shorties" href={viewHref({ type: "shorts" })} onClick={() => navigate({ type: "shorts" })} /><Item compact icon={<Flame className="h-6 w-6" />} label="Trending" href={viewHref({ type: "trending" })} active={view.type === "trending"} onClick={() => navigate({ type: "trending" })} /><Item compact icon={<UsersRound className="h-6 w-6" />} label="Actresses" href={viewHref({ type: "actresses" })} active={view.type === "actresses"} onClick={() => navigate({ type: "actresses" })} /></aside>;
}

export function MobileDrawer() {
  const open = useYT((state) => state.drawerOpen);
  const setDrawer = useYT((state) => state.setDrawer);
  const navigate = useYT((state) => state.navigate);
  if (!open) return null;
  const go = (view: View) => { setDrawer(false); navigate(view); };
  return <div className="fixed inset-0 z-[60]"><button className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} aria-label="Close menu" /><aside role="dialog" aria-label="Navigation" className="absolute inset-y-0 left-0 w-60 overflow-y-auto yt-scroll bg-yt-bg px-3 pb-6 shadow-2xl"><div className="sticky top-0 z-10 flex h-14 items-center bg-yt-bg px-3 text-lg font-bold">Actrezz</div><SidebarContent onNavigate={go} /></aside></div>;
}
