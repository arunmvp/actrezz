"use client";

import { useCallback, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function pageFromUrl() {
  if (typeof window === "undefined") return 1;
  const value = Number(new URL(window.location.href).searchParams.get("page"));
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function hrefForPage(page: number) {
  if (typeof window === "undefined") return page === 1 ? "?" : `?page=${page}`;
  const url = new URL(window.location.href);
  if (page === 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Keeps list pagination shareable, refresh-safe and browser back/forward aware. */
export function useUrlPage(initialPage = 1) {
  const page = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("popstate", onChange);
      window.addEventListener("actrezz:page-change", onChange);
      return () => {
        window.removeEventListener("popstate", onChange);
        window.removeEventListener("actrezz:page-change", onChange);
      };
    },
    pageFromUrl,
    () => initialPage,
  );

  const setPage = useCallback((next: number, replace = false) => {
    const safe = Math.max(1, Math.floor(next));
    if (typeof window === "undefined") return;
    const href = hrefForPage(safe);
    window.history[replace ? "replaceState" : "pushState"]({}, "", href);
    window.dispatchEvent(new Event("actrezz:page-change"));
  }, []);

  return [page, setPage] as const;
}

function pageWindow(current: number, total: number) {
  const values = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2]);
  const pages = [...values].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) result.push("ellipsis");
    result.push(page);
  });
  return result;
}

export function Pagination({ page, totalPages, onPageChange, className }: { page: number; totalPages: number; onPageChange: (page: number) => void; className?: string }) {
  if (totalPages <= 1) return null;
  const change = (next: number) => {
    onPageChange(Math.max(1, Math.min(totalPages, next)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return <nav aria-label="Pagination" className={cn("mt-10 flex flex-wrap items-center justify-center gap-1", className)}>
    <a href={hrefForPage(page - 1)} aria-disabled={page === 1} onClick={(event) => { event.preventDefault(); if (page > 1) change(page - 1); }} aria-label="Previous page" className="grid h-10 w-10 place-items-center rounded-full hover:bg-yt-hover aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-35"><ChevronLeft className="h-5 w-5" /></a>
    {pageWindow(page, totalPages).map((item, index) => item === "ellipsis" ? <span key={`e-${index}`} className="grid h-10 w-8 place-items-center text-yt-text2">…</span> : <a href={hrefForPage(item)} key={item} aria-current={item === page ? "page" : undefined} onClick={(event) => { event.preventDefault(); change(item); }} className={cn("grid h-10 min-w-10 place-items-center rounded-full px-2 text-sm font-medium hover:bg-yt-hover", item === page && "bg-yt-text text-yt-bg hover:bg-yt-text")}>{item}</a>)}
    <a href={hrefForPage(page + 1)} aria-disabled={page === totalPages} onClick={(event) => { event.preventDefault(); if (page < totalPages) change(page + 1); }} aria-label="Next page" className="grid h-10 w-10 place-items-center rounded-full hover:bg-yt-hover aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-35"><ChevronRight className="h-5 w-5" /></a>
  </nav>;
}
