"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { CommentT, Video } from "@/lib/youtube/data";

/* ------------------------------------------------------------------ */
/* View / navigation model                                             */
/* ------------------------------------------------------------------ */

export type View =
  | { type: "home" }
  | { type: "actresses" }
  | { type: "directory"; kind: "movies" | "tv-series" | "tags" | "years" }
  | { type: "taxonomy"; kind: "movie" | "tv-series" | "tag" | "year"; slug: string }
  | { type: "watch"; videoId: string }
  | { type: "shorts" }
  | { type: "search"; query: string }
  | { type: "channel"; channelId: string }
  | { type: "subscriptions" }
  | { type: "history" }
  | { type: "liked" }
  | { type: "trending" }
  | { type: "you" }
  | { type: "watchlater" }
  | { type: "yourvideos" };

let routeNavigator: ((href: string) => void) | null = null;

export function bindRouteNavigator(navigate: (href: string) => void) {
  routeNavigator = navigate;
  return () => {
    if (routeNavigator === navigate) routeNavigator = null;
  };
}

export function viewHref(view: View) {
  switch (view.type) {
    case "home": return "/";
    case "actresses": return "/actresses";
    case "directory": return `/${view.kind}`;
    case "taxonomy": return `/${view.kind}/${encodeURIComponent(view.slug)}`;
    case "watch": return `/watch/${encodeURIComponent(view.videoId)}`;
    case "shorts": return "/shorts";
    case "search": return `/search?q=${encodeURIComponent(view.query)}`;
    case "channel": return `/actress/${encodeURIComponent(view.channelId)}`;
    case "trending": return "/trending";
    default: return "/";
  }
}

interface YTState {
  view: View;
  backStack: View[];
  category: string;
  sidebarOpen: boolean;
  drawerOpen: boolean;
  searchOpen: boolean;

  liked: Record<string, "like" | "dislike">;
  subscribed: Record<string, boolean>;
  bellAll: Record<string, boolean>;
  watchHistory: string[];
  watchProgress: Record<string, number>;
  userComments: Record<string, CommentT[]>;
  commentLikes: Record<string, boolean>;
  watchLater: string[];
  userVideos: Video[];
  autoplay: boolean;
  shortsMuted: boolean;
  miniPlayer: { videoId: string; time: number } | null;
  hiddenFromFeed: string[];

  navigate: (v: View) => void;
  goBack: () => void;
  setCategory: (c: string) => void;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
  setDrawer: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;

  setLike: (videoId: string, kind: "like" | "dislike") => void;
  toggleSubscribe: (channelId: string) => void;
  toggleBell: (channelId: string) => void;
  recordWatch: (videoId: string, progress: number) => void;
  addComment: (videoId: string, text: string) => void;
  toggleCommentLike: (commentId: string) => void;
  toggleWatchLater: (videoId: string) => void;
  addUserVideo: (v: Video) => void;
  setAutoplay: (on: boolean) => void;
  setShortsMuted: (m: boolean) => void;
  openMiniPlayer: (videoId: string, time: number) => void;
  closeMiniPlayer: () => void;
  hideFromFeed: (videoId: string) => void;
  restoreHidden: () => void;
  clearHistory: () => void;
}

const CURRENT_USER = {
  name: "Alex Morgan",
  handle: "@alexmorgan",
  initials: "AM",
  color: "linear-gradient(135deg,#3ea6ff,#065fd4)",
};

export const ME = CURRENT_USER;

const safeBrowserStorage: StateStorage = {
  getItem(name) {
    const value = localStorage.getItem(name);
    if (!value) return null;
    try {
      JSON.parse(value);
      return value;
    } catch {
      localStorage.removeItem(name);
      return null;
    }
  },
  setItem: (name, value) => localStorage.setItem(name, value),
  removeItem: (name) => localStorage.removeItem(name),
};

export const useYT = create<YTState>()(
  persist(
    (set, get) => ({
      view: { type: "home" },
      backStack: [],
      category: "All",
      sidebarOpen: true,
      drawerOpen: false,
      searchOpen: false,

      liked: {},
      subscribed: {
        "ch-techhorizon": true,
        "ch-quantum": true,
        "ch-bytesized": true,
        "ch-mariana": true,
      },
      bellAll: {},
      watchHistory: [],
      watchProgress: {},
      userComments: {},
      commentLikes: {},
      watchLater: [],
      userVideos: [],
      autoplay: true,
      shortsMuted: true,
      miniPlayer: null,
      hiddenFromFeed: [],

      navigate: (v) => {
        const { view, miniPlayer } = get();
        // leaving watch page -> optionally keep playing in miniplayer
        if (view.type === "watch" && v.type !== "watch" && miniPlayer === null) {
          // miniplayer started by user or autoplay; default: keep it going
          set({
            backStack: [...get().backStack, view].slice(-30),
            view: v,
            miniPlayer: { videoId: view.videoId, time: -1 },
          });
          if (typeof window !== "undefined") window.dispatchEvent(new Event("actrezz:navigation-start"));
          routeNavigator?.(viewHref(v));
          return;
        }
        set({
          backStack: v.type === "home" ? [] : [...get().backStack, view].slice(-30),
          view: v,
          drawerOpen: false,
        });
        if (typeof window !== "undefined") window.dispatchEvent(new Event("actrezz:navigation-start"));
        routeNavigator?.(viewHref(v));
      },

      goBack: () => {
        const { backStack } = get();
        if (backStack.length === 0) {
          set({ view: { type: "home" } });
          return;
        }
        const prev = backStack[backStack.length - 1];
        set({ view: prev, backStack: backStack.slice(0, -1) });
      },

      setCategory: (c) => set({ category: c }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebar: (open) => set({ sidebarOpen: open }),
      setDrawer: (open) => set({ drawerOpen: open }),
      setSearchOpen: (open) => set({ searchOpen: open }),

      setLike: (videoId, kind) =>
        set((s) => {
          const cur = s.liked[videoId];
          const liked = { ...s.liked };
          if (cur === kind) delete liked[videoId];
          else liked[videoId] = kind;
          return { liked };
        }),

      toggleSubscribe: (channelId) =>
        set((s) => {
          const subscribed = { ...s.subscribed };
          const bellAll = { ...s.bellAll };
          if (subscribed[channelId]) {
            delete subscribed[channelId];
            delete bellAll[channelId];
          } else subscribed[channelId] = true;
          return { subscribed, bellAll };
        }),

      toggleBell: (channelId) =>
        set((s) => {
          const bellAll = { ...s.bellAll };
          if (bellAll[channelId]) delete bellAll[channelId];
          else bellAll[channelId] = true;
          return { bellAll };
        }),

      recordWatch: (videoId, progress) =>
        set((s) => {
          const watchHistory = [
            videoId,
            ...s.watchHistory.filter((id) => id !== videoId),
          ].slice(0, 40);
          const watchProgress = { ...s.watchProgress, [videoId]: progress };
          return { watchHistory, watchProgress };
        }),

      addComment: (videoId, text) =>
        set((s) => {
          const comment: CommentT = {
            id: `uc-${Date.now()}`,
            author: CURRENT_USER.name,
            handle: CURRENT_USER.handle,
            initials: CURRENT_USER.initials,
            color: CURRENT_USER.color,
            text,
            likes: 0,
            createdAt: Date.now(),
            replies: [],
          };
          return {
            userComments: {
              ...s.userComments,
              [videoId]: [comment, ...(s.userComments[videoId] ?? [])],
            },
          };
        }),

      toggleCommentLike: (commentId) =>
        set((s) => {
          const commentLikes = { ...s.commentLikes };
          if (commentLikes[commentId]) delete commentLikes[commentId];
          else commentLikes[commentId] = true;
          return { commentLikes };
        }),

      toggleWatchLater: (videoId) =>
        set((s) => {
          const watchLater = s.watchLater.includes(videoId)
            ? s.watchLater.filter((id) => id !== videoId)
            : [videoId, ...s.watchLater];
          return { watchLater };
        }),

      addUserVideo: (v) => set((s) => ({ userVideos: [v, ...s.userVideos] })),

      setAutoplay: (on) => set({ autoplay: on }),
      setShortsMuted: (m) => set({ shortsMuted: m }),

      openMiniPlayer: (videoId, time) =>
        set({ miniPlayer: { videoId, time } }),
      closeMiniPlayer: () => set({ miniPlayer: null }),

      hideFromFeed: (videoId) =>
        set((s) => ({ hiddenFromFeed: [...s.hiddenFromFeed, videoId] })),
      restoreHidden: () => set({ hiddenFromFeed: [] }),

      clearHistory: () => set({ watchHistory: [], watchProgress: {} }),
    }),
    {
      name: "actrezz-state",
      storage: createJSONStorage(() => safeBrowserStorage),
      skipHydration: true,
      partialize: (s) => ({
        liked: s.liked,
        subscribed: s.subscribed,
        bellAll: s.bellAll,
        watchHistory: s.watchHistory,
        watchProgress: s.watchProgress,
        userComments: s.userComments,
        commentLikes: s.commentLikes,
        watchLater: s.watchLater,
        userVideos: s.userVideos,
        autoplay: s.autoplay,
        shortsMuted: s.shortsMuted,
        hiddenFromFeed: s.hiddenFromFeed,
      }),
    }
  )
);
