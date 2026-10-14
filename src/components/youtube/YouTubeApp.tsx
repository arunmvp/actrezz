"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bindRouteNavigator, useYT, type View } from "@/store/youtube-store";
import { Header } from "./Header";
import { Sidebar, MobileDrawer } from "./Sidebar";
import { HomePage } from "./pages/HomePage";
import { WatchPage } from "./WatchPage";
import { ShortsPage } from "./pages/ShortsPage";
import { SearchPage } from "./pages/SearchPage";
import { ChannelPage } from "./pages/ChannelPage";
import { ActressesPage } from "./pages/ActressesPage";
import { TrendingPage } from "./pages/ListPages";
import { CatalogDirectoryPage, TaxonomyVideosPage } from "./pages/CatalogPages";
import { MiniPlayer } from "./MiniPlayer";
import { ShareDialog } from "./dialogs";
import { cn } from "@/lib/utils";

const HOME_VIEW: View = { type: "home" };

export function YouTubeApp({ initialView = HOME_VIEW, initialPage = 1 }: { initialView?: View; initialPage?: number }) {
  const router = useRouter();
  const view = useYT((s) => s.view);
  const [routeReady, setRouteReady] = useState(false);
  const activeView = routeReady ? view : initialView;
  const sidebarOpen = useYT((s) => s.sidebarOpen);

  const [shareId, setShareId] = useState<string | null>(null);

  /* rehydrate persisted state after mount (avoids SSR mismatch) */
  useEffect(() => {
    useYT.persist.rehydrate();
  }, []);

  useEffect(() => {
    useYT.setState({ view: initialView, drawerOpen: false });
    // This one-time hydration flag intentionally switches from the route prop to the store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRouteReady(true);
  }, [initialView]);

  useEffect(() => bindRouteNavigator((href) => router.push(href)), [router]);

  /* scroll to top on view change (except shorts which manages itself) */
  useEffect(() => {
    if (activeView.type !== "shorts") window.scrollTo(0, 0);
  }, [activeView]);

  const handleShare = useCallback((videoId: string) => setShareId(videoId), []);

  /* main content renderer */
  const content = (() => {
    switch (activeView.type) {
      case "home":
        return <HomePage onShare={handleShare} initialPage={initialPage} />;
      case "actresses":
        return <ActressesPage initialPage={initialPage} />;
      case "directory":
        return <CatalogDirectoryPage key={activeView.kind} kind={activeView.kind} initialPage={initialPage} />;
      case "taxonomy":
        return <TaxonomyVideosPage key={`${activeView.kind}:${activeView.slug}`} kind={activeView.kind} slug={activeView.slug} onShare={handleShare} initialPage={initialPage} />;
      case "watch":
        return <WatchPage videoId={activeView.videoId} onShare={handleShare} />;
      case "shorts":
        return <ShortsPage onShare={() => setShareId("v1")} />;
      case "search":
        return <SearchPage key={activeView.query} query={activeView.query} onShare={handleShare} initialPage={initialPage} />;
      case "channel":
        return <ChannelPage channelId={activeView.channelId} initialPage={initialPage} />;
      case "trending":
        return <TrendingPage onShare={handleShare} initialPage={initialPage} />;
      default:
        return <HomePage onShare={handleShare} initialPage={initialPage} />;
    }
  })();

  const isImmersive = activeView.type === "watch" || activeView.type === "shorts";

  return (
    <div className="min-h-screen bg-yt-bg text-yt-text">
      <Header />
      <Sidebar />
      <MobileDrawer />

      <main
        className={cn(
          "pt-14",
          !isImmersive && sidebarOpen && "md:pl-60",
          !isImmersive && !sidebarOpen && "md:pl-[72px]",
          isImmersive && activeView.type === "shorts" && "overflow-hidden"
        )}
      >
        {content}
      </main>

      <MiniPlayer />
      <ShareDialog
        key={shareId ?? "none"}
        videoId={shareId}
        onOpenChange={(o) => !o && setShareId(null)}
      />
    </div>
  );
}
