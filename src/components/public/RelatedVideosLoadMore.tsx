"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { CATALOG_NATIVE_DESKTOP_SLOTS, CATALOG_NATIVE_MOBILE_SLOTS, PublicVideoGrid } from "./PublicCards";
import type { PublicVideo } from "@/lib/public-catalog";

type RelatedResponse = { items?: PublicVideo[]; hasMore?: boolean };

const relatedRequests = new Map<string, Promise<RelatedResponse>>();

function relatedRequestKey(slug: string, offset: number) {
  return `${slug}:${offset}`;
}

async function fetchRelatedBatch(slug: string, offset: number): Promise<RelatedResponse> {
  const key = relatedRequestKey(slug, offset);
  const existing = relatedRequests.get(key);
  if (existing) return existing;
  const request = fetch(`/api/public/videos/${encodeURIComponent(slug)}/related?offset=${offset}`, { cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Related feed unavailable");
      return response.json() as Promise<RelatedResponse>;
    })
    .catch((error) => {
      relatedRequests.delete(key);
      throw error;
    });
  relatedRequests.set(key, request);
  if (relatedRequests.size > 32) {
    const oldest = relatedRequests.keys().next().value;
    if (oldest && oldest !== key) relatedRequests.delete(oldest);
  }
  return request;
}

function mergeUnique(current: PublicVideo[], additions: PublicVideo[]) {
  const known = new Set(current.map((item) => item.id));
  return [...current, ...additions.filter((item) => !known.has(item.id))];
}

function RelatedPlaceholder() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-x-4 gap-y-7" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => <div key={item} className="aspect-video animate-pulse rounded-xl bg-yt-skeleton" />)}
    </div>
  );
}

/**
 * Related results live below the watch player, so fetching them on the
 * server delayed video start for content many visitors never reached. This
 * component starts only as the section approaches view and keeps every batch
 * in one grid, avoiding holes and repeated cards after Load more.
 */
export function RelatedVideosLoadMore({ video, nativeZoneIds }: { video: PublicVideo; nativeZoneIds?: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const requestedOffsets = useRef(new Set<number>());
  const [activated, setActivated] = useState(false);
  const [videos, setVideos] = useState<PublicVideo[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadBatch = useCallback(async (offset: number) => {
    if (requestedOffsets.current.has(offset)) return;
    requestedOffsets.current.add(offset);
    setLoading(true);
    setLoadError(false);
    try {
      const result = await fetchRelatedBatch(video.slug, offset);
      const additions = result.items || [];
      setVideos((current) => mergeUnique(current, additions));
      // Advance by the requested page length rather than the number of cards
      // accepted into the grid. If a catalogue update changes ordering between
      // clicks, a duplicate is safely ignored without asking for the same
      // offset forever.
      setNextOffset(offset + 12);
      setHasMore(Boolean(result.hasMore) && additions.length > 0);
    } catch {
      requestedOffsets.current.delete(offset);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [video.slug]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setActivated(true);
      observer.disconnect();
    }, { rootMargin: "850px 0px" });
    observer.observe(section);
    // Related cards are below the player, so wait for its first paint but do
    // not wait for a fast-scrolling visitor to reach the section before the
    // feed starts. This request contains metadata only, never video media.
    const idleWarmup = window.setTimeout(() => setActivated(true), 1_200);
    return () => {
      observer.disconnect();
      window.clearTimeout(idleWarmup);
    };
  }, []);

  useEffect(() => {
    if (activated && !videos.length && !loading && !loadError) {
      // Schedule after the observer effect commits so React does not have to
      // synchronously cascade a state update during this effect pass.
      queueMicrotask(() => { void loadBatch(0); });
    }
  }, [activated, loadBatch, loadError, loading, videos.length]);

  useEffect(() => {
    if (!activated || !videos.length || loading || !hasMore) return;
    // Fetch one following batch after the current grid paints. It is only
    // card metadata, never media, and shares the exact request with Load more.
    const timer = window.setTimeout(() => {
      void fetchRelatedBatch(video.slug, nextOffset).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activated, hasMore, loading, nextOffset, video.slug, videos.length]);

  return (
    <section ref={sectionRef} className="mt-8" aria-label="Related videos">
      <h2 className="mb-4 text-lg font-semibold">Related videos</h2>
      {!activated || (loading && !videos.length) ? <RelatedPlaceholder /> : null}
      {videos.length > 0 && (
        <PublicVideoGrid
          videos={videos}
          sponsoredDesktopAfter={[CATALOG_NATIVE_DESKTOP_SLOTS[0], CATALOG_NATIVE_DESKTOP_SLOTS[1]]}
          sponsoredMobileAfter={[CATALOG_NATIVE_MOBILE_SLOTS[0], CATALOG_NATIVE_MOBILE_SLOTS[1]]}
          nativeZoneIds={nativeZoneIds}
        />
      )}
      {(hasMore || loadError) && activated && (
        <div className="mt-7 flex justify-center">
          <button
            type="button"
            onClick={() => void loadBatch(nextOffset)}
            disabled={loading}
            className="inline-flex min-w-32 items-center justify-center gap-2 rounded-full border border-yt-border bg-yt-surface2 px-5 py-2.5 text-sm font-semibold text-yt-text transition hover:bg-yt-hover hover:text-yt-text disabled:cursor-wait disabled:opacity-70"
          >
            {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {loading ? "Loading" : loadError ? "Try again" : "Load more"}
          </button>
        </div>
      )}
    </section>
  );
}
