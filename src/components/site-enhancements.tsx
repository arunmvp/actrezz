"use client";

import { ArrowUp } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export function TopLoader() {
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);
  const loading = useRef(false);

  const finish = useCallback(() => {
    if (!loading.current) return;
    if (timer.current) clearTimeout(timer.current);
    const elapsed = performance.now() - startedAt.current;
    const wait = Math.max(0, 320 - elapsed);
    timer.current = setTimeout(() => {
      setPhase("done");
      timer.current = setTimeout(() => {
        loading.current = false;
        setPhase("idle");
      }, 240);
    }, wait);
  }, []);

  useEffect(() => {
    const start = () => {
      if (timer.current) clearTimeout(timer.current);
      loading.current = true;
      startedAt.current = performance.now();
      setPhase("loading");
      timer.current = setTimeout(finish, 15_000);
    };
    const complete = () => finish();
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.origin !== location.origin) return;
      const current = `${location.pathname}${location.search}`;
      const next = `${anchor.pathname}${anchor.search}`;
      if (current === next) return;
      start();
    };
    window.addEventListener("actrezz:navigation-start", start);
    window.addEventListener("actrezz:navigation-complete", complete);
    window.addEventListener("popstate", start);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("actrezz:navigation-start", start);
      window.removeEventListener("actrezz:navigation-complete", complete);
      window.removeEventListener("popstate", start);
      document.removeEventListener("click", click, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [finish]);

  return <div className={`top-loader ${phase}`} aria-hidden="true"><span /></div>;
}

export function NavigationReadySignal() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        window.dispatchEvent(new Event("actrezz:navigation-complete"));
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [pathname, query]);

  return null;
}

export function GoToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 600);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return <button type="button" aria-label="Go to top" title="Go to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className={`fixed bottom-5 right-5 z-40 grid h-11 w-11 place-items-center rounded-full border border-yt-border bg-yt-surface text-yt-text shadow-xl transition-all hover:bg-yt-hover ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}><ArrowUp className="h-5 w-5" /></button>;
}
