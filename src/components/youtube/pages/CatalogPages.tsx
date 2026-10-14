"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clapperboard, Film, Search, Tags } from "lucide-react";
import { MOVIES, TAGS, TV_SERIES, VIDEOS, WORKS, YEARS, type Video } from "@/lib/youtube/data";
import { useYT, viewHref } from "@/store/youtube-store";
import { VideoCard } from "../VideoCard";
import { Pagination, useUrlPage } from "../Pagination";

type DirectoryKind = "movies" | "tv-series" | "tags" | "years";
type TaxonomyKind = "movie" | "tv-series" | "tag" | "year";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const DIRECTORY_PAGE_SIZE = 60;
const VIDEO_PAGE_SIZE = 36;

const directoryCopy = {
  movies: { title: "Movies", description: "Browse every movie represented in the video catalogue.", Icon: Film },
  "tv-series": { title: "TV Series", description: "Browse television series and episodes by title.", Icon: Clapperboard },
  tags: { title: "Tags & genres", description: "Explore videos by curated topic and scene tags.", Icon: Tags },
  years: { title: "Years", description: "Browse the catalogue by movie or episode release year.", Icon: CalendarDays },
};

export function CatalogDirectoryPage({ kind, initialPage = 1 }: { kind: DirectoryKind; initialPage?: number }) {
  const navigate = useYT((state) => state.navigate);
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("All");
  const [page, setPage] = useUrlPage(initialPage);
  const copy = directoryCopy[kind];
  const needle = query.trim().toLowerCase();

  const works = useMemo(() => {
    const source = kind === "movies" ? MOVIES : TV_SERIES;
    return source.filter((item) => (!needle || item.title.toLowerCase().includes(needle)) && (letter === "All" || item.title.toUpperCase().startsWith(letter)));
  }, [kind, letter, needle]);
  const tags = useMemo(() => TAGS.filter((item) => (!needle || item.name.toLowerCase().includes(needle)) && (letter === "All" || item.name.toUpperCase().startsWith(letter))), [letter, needle]);
  const years = useMemo(() => YEARS.filter((item) => !needle || String(item.year).includes(needle)), [needle]);
  const total = kind === "tags" ? tags.length : kind === "years" ? years.length : works.length;
  const totalPages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  const start = (Math.min(page, totalPages) - 1) * DIRECTORY_PAGE_SIZE;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-5 sm:px-6">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-3"><copy.Icon className="h-7 w-7 text-[#ff2d78]" /><h1 className="text-3xl font-bold text-yt-text">{copy.title}</h1></div>
          <p className="mt-2 text-sm text-yt-text2">{copy.description} · {total} available</p>
        </div>
        <label className="flex h-10 w-full max-w-sm items-center gap-2 rounded-full border border-yt-border bg-yt-search-bg px-4 focus-within:border-yt-blue">
          <Search className="h-4 w-4 text-yt-text2" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={`Search ${copy.title.toLowerCase()}`} className="min-w-0 flex-1 bg-transparent text-sm text-yt-text outline-none" />
        </label>
      </div>

      {kind !== "years" && <div className="no-scrollbar mb-6 flex gap-1 overflow-x-auto pb-1" aria-label="Filter alphabetically">{["All", ...LETTERS].map((value) => <button key={value} type="button" onClick={() => { setLetter(value); setPage(1); }} className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-medium ${letter === value ? "bg-yt-text text-yt-bg" : "bg-yt-chip text-yt-text hover:bg-yt-hover"}`}>{value}</button>)}</div>}

      {(kind === "movies" || kind === "tv-series") && (
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {works.slice(start, start + DIRECTORY_PAGE_SIZE).map((item) => {
            const target = { type: "taxonomy" as const, kind: kind === "movies" ? "movie" as const : "tv-series" as const, slug: item.slug };
            return <a key={`${item.type}-${item.slug}`} href={viewHref(target)} onClick={(event) => { event.preventDefault(); navigate(target); }} className="group flex min-w-0 items-center justify-between gap-3 border-b border-yt-border/60 py-3">
              <h2 className="truncate text-[15px] font-medium text-yt-text group-hover:text-[#ff2d78]">{item.title}</h2>
              <p className="shrink-0 text-xs text-yt-text2">{item.videoCount}</p>
            </a>;
          })}
        </div>
      )}

      {kind === "tags" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {tags.slice(start, start + DIRECTORY_PAGE_SIZE).map((item) => {
            const target = { type: "taxonomy" as const, kind: "tag" as const, slug: item.slug };
            return <a key={item.slug} href={viewHref(target)} onClick={(event) => { event.preventDefault(); navigate(target); }} className="rounded-xl border border-yt-border bg-yt-surface2 p-4 transition-colors hover:bg-yt-hover">
              <h2 className="truncate text-base font-medium text-yt-text">#{item.name}</h2><p className="mt-1 text-xs text-yt-text2">{item.videoCount} videos</p>
            </a>;
          })}
        </div>
      )}

      {kind === "years" && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
          {years.slice(start, start + DIRECTORY_PAGE_SIZE).map((item) => {
            const target = { type: "taxonomy" as const, kind: "year" as const, slug: String(item.year) };
            return <a key={item.year} href={viewHref(target)} onClick={(event) => { event.preventDefault(); navigate(target); }} className="rounded-xl border border-yt-border bg-yt-surface2 px-3 py-5 text-center transition-colors hover:bg-yt-hover">
              <h2 className="text-xl font-bold text-yt-text">{item.year}</h2><p className="mt-1 text-xs text-yt-text2">{item.videoCount} videos</p>
            </a>;
          })}
        </div>
      )}

      <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onPageChange={setPage} />
      {total === 0 && <p className="py-24 text-center text-sm text-yt-text2">No matching {copy.title.toLowerCase()} found.</p>}
    </div>
  );
}

function videosFor(kind: TaxonomyKind, slug: string): Video[] {
  if (kind === "movie") return VIDEOS.filter((video) => video.workType === "MOVIE" && video.workSlug === slug);
  if (kind === "tv-series") return VIDEOS.filter((video) => video.workType === "TV_SHOW" && video.workSlug === slug);
  if (kind === "tag") return VIDEOS.filter((video) => video.tagSlugs?.includes(slug));
  return VIDEOS.filter((video) => String(video.year) === slug);
}

export function TaxonomyVideosPage({ kind, slug, onShare, initialPage = 1 }: { kind: TaxonomyKind; slug: string; onShare: (videoId: string) => void; initialPage?: number }) {
  const [page, setPage] = useUrlPage(initialPage);
  const videos = useMemo(() => videosFor(kind, slug), [kind, slug]);
  const work = WORKS.find((item) => item.slug === slug && item.type === (kind === "movie" ? "MOVIE" : "TV_SHOW"));
  const tag = TAGS.find((item) => item.slug === slug);
  const title = kind === "year" ? `${slug} videos` : kind === "tag" ? `#${tag?.name ?? slug}` : work?.title ?? slug.replace(/-/g, " ");
  const description = work?.description || `${videos.length} curated ${videos.length === 1 ? "video" : "videos"} in the Actrezz catalogue.`;
  const totalPages = Math.max(1, Math.ceil(videos.length / VIDEO_PAGE_SIZE));
  const activePage = Math.min(page, totalPages);
  const start = (activePage - 1) * VIDEO_PAGE_SIZE;

  return <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-6 sm:px-6">
    <header className="mb-7 border-b border-yt-border/60 pb-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff2d78]">{kind.replace("-", " ")}</p><h1 className="mt-2 text-3xl font-bold capitalize text-yt-text">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-yt-text2">{description}</p></header>
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-4 gap-y-6">{videos.slice(start, start + VIDEO_PAGE_SIZE).map((video) => <VideoCard key={video.id} video={video} onShare={() => onShare(video.id)} />)}</div>
    <Pagination page={activePage} totalPages={totalPages} onPageChange={setPage} />
    {videos.length === 0 && <p className="py-24 text-center text-sm text-yt-text2">No videos available for this page yet.</p>}
  </div>;
}
