"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useYT } from "@/store/youtube-store";
import { cn } from "@/lib/utils";

export function PublicMain({
  children,
  wide = false,
  fullWidth = false,
  flush = false,
  mobileImmersive = false,
  afterContent,
}: {
  children: ReactNode;
  wide?: boolean;
  fullWidth?: boolean;
  flush?: boolean;
  mobileImmersive?: boolean;
  afterContent?: ReactNode;
}) {
  const sidebarOpen = useYT((state) => state.sidebarOpen);
  const pathname = usePathname();
  // `view` is restored after hydration. Using it for the page geometry made a
  // server-rendered watch page first occupy the sidebar layout, then shift to
  // its immersive layout once the store updated. The URL is already stable on
  // both renders, so it prevents that visible watch-page layout shift.
  const immersive = pathname.startsWith("/watch/") || pathname === "/shorts" || pathname.startsWith("/shorts/");

  return (
    <main
      className={cn(
        "transition-[padding-left] duration-200 ease-out",
        mobileImmersive ? "pt-0 sm:pt-14" : "pt-14",
        !immersive && sidebarOpen && "md:pl-60",
        !immersive && !sidebarOpen && "md:pl-[72px]"
      )}
    >
      <div className={cn(
        "mx-auto w-full",
        flush ? "max-w-none p-0" : "px-3 pb-12 pt-5 sm:px-4 lg:px-6 xl:px-8",
        !flush && (fullWidth ? "max-w-none" : wide ? "max-w-[1754px]" : "max-w-[1400px]")
      )}>
        {children}
        {afterContent}
      </div>
    </main>
  );
}
