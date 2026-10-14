"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ShortsLogo } from "./icons";
import { useYT } from "@/store/youtube-store";
import { SHORTS, channelById } from "@/lib/youtube/data";
import { formatViews } from "@/lib/youtube/format";

/** Horizontal shelf of vertical short videos shown in the home feed */
export function ShortsShelf() {
  const navigate = useYT((s) => s.navigate);
  const scroller = useRef<HTMLDivElement>(null);

  const scrollBy = (dx: number) =>
    scroller.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <section className="my-2 border-y border-yt-border/60 py-4">
      <div className="mb-3 flex items-center justify-between pr-2">
        <button
          onClick={() => navigate({ type: "shorts" })}
          className="flex items-center gap-2 px-1"
        >
          <ShortsLogo className="h-6 w-6" />
          <h2 className="text-xl font-bold text-yt-text">Shorts</h2>
        </button>
        <div className="hidden gap-2 sm:flex">
          <button
            aria-label="Scroll left"
            onClick={() => scrollBy(-600)}
            className="grid h-9 w-9 place-items-center rounded-full bg-yt-chip hover:bg-yt-hover"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            aria-label="Scroll right"
            onClick={() => scrollBy(600)}
            className="grid h-9 w-9 place-items-center rounded-full bg-yt-chip hover:bg-yt-hover"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        ref={scroller}
        className="no-scrollbar flex gap-2 overflow-x-auto sm:gap-4"
      >
        {SHORTS.map((s) => {
          const ch = channelById(s.channelId);
          return (
            <button
              key={s.id}
              onClick={() => navigate({ type: "shorts" })}
              className="group w-[160px] shrink-0 text-left sm:w-[210px]"
            >
              <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-yt-skeleton">
                <img
                  src={`https://picsum.photos/seed/${s.thumbSeed}/270/480`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8">
                  <p className="line-clamp-2 text-sm font-medium text-white">
                    {s.title}
                  </p>
                  <p className="mt-1 text-xs text-white/80">
                    {formatViews(s.views)}
                  </p>
                </div>
              </div>
              <p className="mt-2 truncate text-xs text-yt-text2">{ch.name}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
