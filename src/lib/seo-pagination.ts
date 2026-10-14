import type { Metadata } from "next";
import { parsePageParam } from "./pagination";

export async function pageFromSearchParams(searchParams: Promise<{ page?: string }>) {
  return parsePageParam((await searchParams).page);
}

export function paginatedPath(pathname: string, page: number) {
  const cleanPath = pathname === "/" ? "/" : pathname.replace(/\/$/, "");
  return page <= 1 ? cleanPath : `${cleanPath}?page=${page}`;
}

export function paginatedMetadata({
  pathname,
  page,
  title,
  description,
  robots,
}: {
  pathname: string;
  page: number;
  title: string;
  description: string;
  robots?: Metadata["robots"];
}): Metadata {
  const suffix = page > 1 ? ` - Page ${page}` : "";
  // Page one is the topical landing page. Later grid pages are useful for
  // visitors and keep their own canonical URL, but they are thin variations
  // that should pass links onward instead of competing in search results.
  const effectiveRobots: Metadata["robots"] = page > 1
    ? { index: false, follow: true }
    : robots;
  return {
    title: `${title}${suffix}`,
    description: page > 1 ? `${description} Page ${page}.` : description,
    alternates: { canonical: paginatedPath(pathname, page) },
    openGraph: { title: `${title}${suffix}`, description, url: paginatedPath(pathname, page), type: "website" },
    twitter: { card: "summary", title: `${title}${suffix}`, description },
    robots: effectiveRobots,
  };
}
