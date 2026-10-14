"use client";

import { useEffect } from "react";

type PopunderWindow = Window & {
  __actrezzPopunderLoaded?: boolean;
  __actrezzPopunderAnchorSequence?: number;
  ad_idzone?: string;
  ad_tags?: string;
  ad_popup_fallback?: boolean;
  ad_popup_force?: boolean;
  ad_chrome_enabled?: boolean;
  ad_new_tab?: boolean;
  ad_frequency_period?: number;
  ad_frequency_count?: number;
  ad_trigger_method?: number;
  ad_trigger_class?: string;
  ad_trigger_delay?: number;
  ad_capping_enabled?: boolean;
  msgJsPop101?: { bindTo?: (target: string | string[]) => void };
};

export function ExoClickPopunder({
  desktopZoneId,
  mobileZoneId,
  scriptUrl,
  frequencyPeriod,
  frequencyCount,
  triggerMethod,
  triggerDelay,
  triggerClass = "actrezz-popunder-trigger",
}: {
  desktopZoneId?: string;
  mobileZoneId?: string;
  scriptUrl?: string;
  frequencyPeriod: number;
  frequencyCount: number;
  triggerMethod: number;
  triggerDelay: number;
  triggerClass?: string;
}) {
  useEffect(() => {
    const mobileDevice = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.matchMedia("(max-width: 767px)").matches;
    const zoneId = mobileDevice ? mobileZoneId || desktopZoneId : desktopZoneId || mobileZoneId;
    if (!zoneId || !scriptUrl) return;
    const target = window as PopunderWindow;

    target.ad_idzone = zoneId;
    target.ad_tags = document.querySelector<HTMLMetaElement>('meta[name="keywords"]')?.content || "";
    target.ad_popup_fallback = false;
    // ExoClick's standard tab/popunder hand-off reverses the site navigation
    // in current Chromium. Force Popup keeps the content navigation in this
    // tab and puts the advertising destination in its own popup/tab.
    target.ad_popup_force = true;
    target.ad_chrome_enabled = true;
    // In ExoClick's current Chrome runtime, tab mode keeps the catalogue
    // navigation in this tab and opens the advertising destination separately.
    target.ad_new_tab = true;
    target.ad_frequency_period = frequencyPeriod;
    target.ad_frequency_count = frequencyCount;
    target.ad_trigger_method = triggerMethod;
    // Scope popunders to intentional catalogue-card navigation. Never attach
    // them to player/fullscreen controls, seeking, pause or ordinary UI taps.
    target.ad_trigger_class = triggerClass;
    target.ad_trigger_delay = triggerDelay;
    target.ad_capping_enabled = true;

    // ExoClick binds listeners when its script starts. Catalogue cards added
    // by client-side Load more did not exist at that instant, so they could
    // never trigger a popunder. Bind only newly inserted catalogue links to
    // the provider's own public binding method; the provider still owns all
    // capping, eligibility and anti-abuse decisions.
    const pending = new Set<HTMLAnchorElement>();
    let retryTimer: number | undefined;
    let retryCount = 0;
    const addCandidates = (root: Node) => {
      if (root instanceof HTMLAnchorElement && root.classList.contains(triggerClass)) pending.add(root);
      if (!(root instanceof Element)) return;
      root.querySelectorAll<HTMLAnchorElement>(`a.${triggerClass}`).forEach((anchor) => pending.add(anchor));
    };
    const bindPending = () => {
      const bindTo = target.msgJsPop101?.bindTo;
      if (!bindTo || !pending.size) return false;
      for (const anchor of [...pending]) {
        if (!anchor.isConnected) {
          pending.delete(anchor);
          continue;
        }
        const sequence = (target.__actrezzPopunderAnchorSequence ?? 0) + 1;
        target.__actrezzPopunderAnchorSequence = sequence;
        const selectorClass = `actrezz-popunder-bound-${sequence}`;
        anchor.classList.add(selectorClass);
        try {
          bindTo(`.${selectorClass}`);
          anchor.dataset.actrezzPopunderBound = "true";
          pending.delete(anchor);
        } catch {
          anchor.classList.remove(selectorClass);
        }
      }
      return pending.size === 0;
    };
    const retryBinding = () => {
      const complete = bindPending();
      if (!complete && pending.size && retryCount < 80) {
        retryCount += 1;
        retryTimer = window.setTimeout(retryBinding, 250);
      }
    };
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(addCandidates));
      if (pending.size) retryBinding();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    if (!target.__actrezzPopunderLoaded) {
      target.__actrezzPopunderLoaded = true;
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.type = "application/javascript";
      script.dataset.actrezzPopunder = "true";
      script.addEventListener("load", retryBinding, { once: true });
      script.addEventListener("error", () => {
        target.__actrezzPopunderLoaded = false;
        script.remove();
      }, { once: true });
      document.body.appendChild(script);
    }

    return () => {
      observer.disconnect();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [desktopZoneId, frequencyCount, frequencyPeriod, mobileZoneId, scriptUrl, triggerClass, triggerDelay, triggerMethod]);

  return null;
}
