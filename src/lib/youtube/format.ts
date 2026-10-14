/** Formatting helpers that mirror video platform conventions */

export function formatCompact(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${trim(n / 1000)}K`;
  if (n < 1_000_000_000) return `${trim(n / 1_000_000)}M`;
  return `${trim(n / 1_000_000_000)}B`;
}

function trim(v: number): string {
  const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatViews(n: number): string {
  return `${formatCompact(n)} views`;
}

export function formatSubs(n: number): string {
  return `${formatCompact(n)} subscribers`;
}

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** "3 weeks ago" style relative time */
export function timeAgo(timestamp: number): string {
  const diff = Math.max(0, NOW_MS - timestamp);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min > 1 ? "s" : ""} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr > 1 ? "s" : ""} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day > 1 ? "s" : ""} ago`;
  if (day < 30) {
    const w = Math.floor(day / 7);
    return `${w} week${w > 1 ? "s" : ""} ago`;
  }
  if (day < 365) {
    const mo = Math.floor(day / 30);
    return `${mo} month${mo > 1 ? "s" : ""} ago`;
  }
  const yr = Math.floor(day / 365);
  return `${yr} year${yr > 1 ? "s" : ""} ago`;
}

/** Fixed reference so SSR and client render identical relative times */
export const NOW_MS = new Date("2026-09-10T00:00:00Z").getTime();

export function daysAgo(days: number, hours = 0): number {
  return NOW_MS - days * 86_400_000 - hours * 3_600_000;
}

export function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
