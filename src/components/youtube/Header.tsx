"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Bell, Keyboard, Menu, Monitor, Moon, Search, Settings, Sun } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, IconButton } from "./basics";
import { LogoMark } from "./icons";
import { useYT, viewHref } from "@/store/youtube-store";
import { timeAgo } from "@/lib/youtube/format";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  title: string;
  slug: string;
  thumbnailUrl: string;
  publishedAt: string;
  isShort: boolean;
  actress: {
    id: string;
    name: string;
    slug: string;
    profileImageUrl: string;
    initials: string;
    color: string;
  } | null;
};

type SearchSuggestion = {
  kind: "video" | "actress";
  slug: string;
  label: string;
};

export function Header() {
  const { theme, setTheme } = useTheme();
  const navigate = useYT((state) => state.navigate);
  const setDrawer = useYT((state) => state.setDrawer);
  const drawerOpen = useYT((state) => state.drawerOpen);
  const toggleSidebar = useYT((state) => state.toggleSidebar);
  const immersive = useYT((state) => state.view.type === "watch" || state.view.type === "shorts");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationState, setNotificationState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [notificationRequest, setNotificationRequest] = useState(0);
  const notificationStateRef = useRef<"idle" | "loading" | "loaded" | "error">("idle");
  const notificationLoadedAtRef = useRef(0);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focused) return;
    const close = (event: MouseEvent) => { if (formRef.current && !formRef.current.contains(event.target as Node)) setFocused(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [focused]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (event.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") { event.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    // Notifications are only useful after the visitor opens the menu. Loading
    // them on every catalogue page competes with the first click/tap and adds
    // an avoidable state update during the INP measurement window.
    if (!notificationOpen || notificationStateRef.current === "loaded" || notificationStateRef.current === "loading") return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    notificationStateRef.current = "loading";
    setNotificationState("loading");
    fetch("/api/public/notifications", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Notifications request failed");
        return response.json();
      })
      .then((payload) => {
        setNotifications(Array.isArray(payload?.items) ? payload.items.slice(0, 10) : []);
        notificationStateRef.current = "loaded";
        notificationLoadedAtRef.current = Date.now();
        setNotificationState("loaded");
      })
      .catch(() => {
        if (disposed) return;
        notificationStateRef.current = "error";
        setNotificationState("error");
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
      if (notificationStateRef.current === "loading") notificationStateRef.current = "idle";
    };
  }, [notificationOpen, notificationRequest]);

  useEffect(() => {
    if (!notificationOpen || notificationStateRef.current !== "loaded") return;
    if (Date.now() - notificationLoadedAtRef.current < 60_000) return;
    notificationStateRef.current = "idle";
    setNotificationState("idle");
    setNotificationRequest((value) => value + 1);
  }, [notificationOpen]);

  const needle = query.trim().toLowerCase();

  useEffect(() => {
    if (needle.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/public/search-suggestions?q=${encodeURIComponent(needle)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (payload && Array.isArray(payload.items)) setSuggestions(payload.items);
        })
        .catch(() => {});
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [needle]);

  function submit(value: string) {
    const clean = value.trim(); if (!clean) return;
    setFocused(false); setMobileSearch(false); inputRef.current?.blur();
    navigate({ type: "search", query: clean });
  }

  return <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-1 bg-yt-bg px-2 sm:px-4">
    {!mobileSearch && <div className="flex min-w-0 items-center gap-1"><IconButton label="Guide" onClick={() => { if (immersive || window.innerWidth < 768) setDrawer(!drawerOpen); else toggleSidebar(); }}><Menu className="h-6 w-6"/></IconButton><button className="flex items-center px-2 py-2" onClick={() => navigate({type:"home"})} aria-label="Actrezz home"><LogoMark className="h-[22px] w-auto text-yt-text"/></button></div>}

    <div ref={formRef} className={cn("flex flex-1 items-center justify-center gap-2 sm:gap-4", mobileSearch ? "flex" : "hidden md:flex")}>
      {mobileSearch && <IconButton label="Back" onClick={() => setMobileSearch(false)} className="md:hidden"><Menu className="h-6 w-6 rotate-90"/></IconButton>}
      <form onSubmit={(event)=>{event.preventDefault();submit(query)}} className="group relative flex w-full max-w-[640px] items-center"><div className={cn("flex h-10 w-full items-center overflow-hidden rounded-full border border-yt-border bg-yt-search-bg pl-4",focused&&"border-yt-blue")}><input ref={inputRef} value={query} onChange={(event)=>setQuery(event.target.value)} onFocus={()=>setFocused(true)} placeholder="Search videos, actresses, movies" aria-label="Search" maxLength={100} className="h-full min-w-0 flex-1 bg-transparent text-base text-yt-text outline-none placeholder:text-yt-text2"/><button type="submit" aria-label="Search" className="grid h-10 w-16 shrink-0 place-items-center border-l border-yt-border bg-yt-search-btn hover:bg-yt-hover"><Search className="h-5 w-5"/></button></div>
        {focused && needle.length >= 2 && suggestions.length > 0 && <div className="absolute inset-x-0 top-12 z-50 overflow-hidden rounded-xl border border-yt-border/50 bg-yt-surface py-2 shadow-2xl">{suggestions.map((item)=><button type="button" key={`${item.kind}-${item.slug}`} onClick={()=>{setFocused(false);navigate(item.kind==="video"?{type:"watch",videoId:item.slug}:{type:"channel",channelId:item.slug})}} className="flex w-full items-center gap-4 px-4 py-2 text-left hover:bg-yt-hover"><Search className="h-4 w-4 shrink-0 text-yt-text2"/><span className="min-w-0 flex-1 truncate text-sm font-medium text-yt-text">{item.label}</span><span className="text-xs capitalize text-yt-text2">{item.kind}</span></button>)}</div>}
      </form>
    </div>

    {!mobileSearch && <div className="flex shrink-0 items-center gap-0.5 sm:gap-1"><IconButton label="Search" className="md:hidden" onClick={()=>setMobileSearch(true)}><Search className="h-6 w-6"/></IconButton>
      <DropdownMenu open={notificationOpen} onOpenChange={setNotificationOpen}><DropdownMenuTrigger asChild><button aria-label="Notifications" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-yt-hover"><Bell className="h-6 w-6"/><span className="absolute right-1 top-1 grid min-w-[16px] place-items-center rounded-full bg-[#ff2d78] px-[3px] text-[10px] font-medium leading-4 text-white">{notifications.length || 10}</span></button></DropdownMenuTrigger><DropdownMenuContent align="end" sideOffset={8} className="w-[min(420px,calc(100vw-24px))] border-yt-border/50 bg-yt-surface p-0"><div className="border-b border-yt-border/60 px-4 py-3 text-base font-medium">Latest 10 on Actrezz</div><div className="max-h-[420px] overflow-y-auto yt-scroll">{notifications.length ? notifications.map((item)=>{const person=item.actress;const target={type:"watch" as const,videoId:item.slug};const href=item.isShort?`/shorts/${item.slug}`:viewHref(target);return <a key={item.id} href={href} onClick={item.isShort?undefined:(event)=>{event.preventDefault();navigate(target);}} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-yt-hover"><Avatar initials={person?.initials || "A"} color={person?.color || "linear-gradient(135deg,#ff2d78,#7c3aed)"} imgSrc={person?.profileImageUrl} size={40}/><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm text-yt-text">{item.isShort ? "New short added" : "New video added"}: {item.title}</p><p className="mt-1 text-xs text-yt-text2">{timeAgo(Date.parse(item.publishedAt))}</p></div><img src={item.thumbnailUrl} alt={`${item.title} thumbnail`} loading="lazy" className="h-[54px] w-24 shrink-0 rounded-md object-cover"/></a>}) : notificationState === "error" ? <div className="px-4 py-6 text-center text-sm text-yt-text2"><p>Could not load new videos.</p><button type="button" onClick={()=>{notificationStateRef.current="idle";setNotificationState("idle");setNotificationRequest((value)=>value+1);}} className="mt-3 rounded-full bg-yt-chip px-4 py-2 font-medium text-yt-text hover:bg-yt-hover">Try again</button></div> : <div className="px-4 py-6 text-sm text-yt-text2">Loading latest videos...</div>}</div></DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger asChild><button aria-label="Display settings" className="ml-1 grid h-10 w-10 place-items-center rounded-full hover:bg-yt-hover"><Settings className="h-6 w-6"/></button></DropdownMenuTrigger><DropdownMenuContent align="end" sideOffset={8} className="w-56 border-yt-border/50 bg-yt-surface"><div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-yt-text2">Appearance</div><DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as "dark" | "light" | "system")}><DropdownMenuRadioItem value="dark" className="gap-3"><Moon className="h-4 w-4"/>Dark</DropdownMenuRadioItem><DropdownMenuRadioItem value="light" className="gap-3"><Sun className="h-4 w-4"/>Light</DropdownMenuRadioItem><DropdownMenuRadioItem value="system" className="gap-3"><Monitor className="h-4 w-4"/>Device theme</DropdownMenuRadioItem></DropdownMenuRadioGroup><DropdownMenuSeparator/><DropdownMenuItem className="gap-3"><Keyboard className="h-4 w-4"/>Player shortcuts</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </div>}
  </header>;
}
