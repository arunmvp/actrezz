"use client";

import { useYT } from "@/store/youtube-store";
import { CATEGORIES } from "@/lib/youtube/data";
import { cn } from "@/lib/utils";

export function CategoryChips() {
  const category = useYT((s) => s.category);
  const setCategory = useYT((s) => s.setCategory);

  return (
    <div className="sticky top-14 z-40 bg-yt-bg/95 backdrop-blur-sm">
      <div className="no-scrollbar flex gap-3 overflow-x-auto py-3">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              "h-8 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors",
              category === c
                ? "bg-yt-chip-active text-yt-chip-active-text"
                : "bg-yt-chip text-yt-text hover:bg-yt-hover"
            )}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
