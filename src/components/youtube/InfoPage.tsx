"use client";

import { Header } from "./Header";
import { MobileDrawer, Sidebar } from "./Sidebar";
import { useYT } from "@/store/youtube-store";
import { cn } from "@/lib/utils";

export function InfoPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const sidebarOpen = useYT((state) => state.sidebarOpen);

  return (
    <div className="min-h-screen bg-yt-bg text-yt-text">
      <Header />
      <Sidebar />
      <MobileDrawer />
      <main
        className={cn(
          "px-4 pb-16 pt-20 transition-[padding] md:px-8",
          sidebarOpen ? "md:pl-[272px]" : "md:pl-[104px]"
        )}
      >
        <article className="mx-auto max-w-3xl rounded-2xl border border-yt-border bg-yt-surface p-6 sm:p-10">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <div className="mt-6 space-y-5 text-sm leading-7 text-yt-text2">{children}</div>
        </article>
      </main>
    </div>
  );
}
