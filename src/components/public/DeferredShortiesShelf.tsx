"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicVideo } from "@/lib/public-catalog";
import { selectHomeShorties, selectTrendingShorties, ShortiesShelf } from "./ShortiesShelf";

type ShelfMode = "home" | "trending";

function ShelfPlaceholder({ title }: { title: string }) {
  return (
    <section className="mt-12 border-t border-yt-border/70 pt-7" aria-label={`${title} loading`}>
      <div className="mb-4 h-8 w-40 animate-pulse rounded bg-yt-skeleton" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-52 w-36 shrink-0 animate-pulse rounded-xl bg-yt-skeleton sm:h-60 sm:w-40" />)}
      </div>
    </section>
  );
}

/**
 * Home/Trending rails are deliberately fetched only when they are close to
 * view. They are useful discovery content, but never need to delay the first
 * video grid, LCP image, or first interaction.
 */
export function DeferredShortiesShelf({ mode, page, title = "Shorties" }: { mode: ShelfMode; page: number; title?: string }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [activated, setActivated] = useState(false);
  const [videos, setVideos] = useState<PublicVideo[] | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setActivated(true);
      observer.disconnect();
    }, { rootMargin: "700px 0px" });
    observer.observe(anchor);
    // Do not compete with the first page paint, but warm this lightweight
    // metadata rail shortly afterwards so it is ready by the time a visitor
    // reaches it on an ordinary scroll.
    const idleWarmup = window.setTimeout(() => setActivated(true), 1_200);
    return () => {
      observer.disconnect();
      window.clearTimeout(idleWarmup);
    };
  }, []);

  useEffect(() => {
    if (!activated || videos) return;
    const controller = new AbortController();
    void fetch(`/api/public/shorts?page=${page}`, { cache: "force-cache", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ items?: PublicVideo[] }> : null)
      .then((result) => {
        if (!result) return;
        const items = result.items || [];
        setVideos(mode === "home" ? selectHomeShorties(items) : selectTrendingShorties(items, new Set()));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [activated, mode, page, videos]);

  return (
    <div ref={anchorRef}>
      {videos ? <ShortiesShelf videos={videos} title={title} /> : <ShelfPlaceholder title={title} />}
    </div>
  );
}
