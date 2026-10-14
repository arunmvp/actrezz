"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { bindRouteNavigator, useYT, type View } from "@/store/youtube-store";

function viewFromPath(pathname: string, query: string | null): View {
  if (pathname === "/") return { type: "home" };
  if (pathname === "/trending") return { type: "trending" };
  if (pathname === "/shorts") return { type: "shorts" };
  if (pathname === "/actresses") return { type: "actresses" };
  if (pathname === "/movies") return { type: "directory", kind: "movies" };
  if (pathname === "/tv-series") return { type: "directory", kind: "tv-series" };
  if (pathname === "/tags") return { type: "directory", kind: "tags" };
  if (pathname === "/years") return { type: "directory", kind: "years" };
  if (pathname === "/search") return { type: "search", query: query ?? "" };

  const [, first, second] = pathname.split("/");
  const slug = decodeURIComponent(second ?? "");
  if (first === "shorts" && slug) return { type: "shorts" };
  if (first === "watch" && slug) return { type: "watch", videoId: slug };
  if (first === "actress" && slug) return { type: "channel", channelId: slug };
  if (first === "movie" && slug) return { type: "taxonomy", kind: "movie", slug };
  if (first === "tv-series" && slug) return { type: "taxonomy", kind: "tv-series", slug };
  if (first === "tag" && slug) return { type: "taxonomy", kind: "tag", slug };
  if (first === "year" && slug) return { type: "taxonomy", kind: "year", slug };
  return { type: "home" };
}

export function PublicRouteBinder() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("q");
  const view = useMemo(() => viewFromPath(pathname, query), [pathname, query]);

  useEffect(() => bindRouteNavigator((href) => router.push(href)), [router]);

  useEffect(() => {
    useYT.persist.rehydrate();
  }, []);

  useEffect(() => {
    useYT.setState({ view, drawerOpen: false });
  }, [view]);

  return null;
}
