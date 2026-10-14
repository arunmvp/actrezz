# MyTube — YouTube Clone

A pixel-faithful, fully interactive YouTube replica built with **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + Zustand**.

## Contents

```
mytube-youtube-clone/
├── production/          ← Ready-to-run standalone build (no install needed)
│   ├── server.js        ← Node.js production server
│   ├── package.json
│   ├── node_modules/    ← production dependencies only
│   ├── .next/           ← compiled app + static assets
│   └── public/          ← favicon, logo, robots.txt
├── src/                 ← full TypeScript/React source
│   ├── app/             ← Next.js entry (layout.tsx, page.tsx, globals.css)
│   ├── components/
│   │   ├── youtube/     ← Header, Sidebar, VideoCard, VideoPlayer, Comments,
│   │   │                  ShortsShelf, CategoryChips, MiniPlayer, dialogs…
│   │   │   └── pages/   ← HomePage, WatchPage, SearchPage, ShortsPage,
│   │   │                  ChannelPage, ListPages
│   │   └── ui/          ← shadcn/ui primitives
│   ├── lib/youtube/     ← dataset (14 channels, 32 videos, 10 shorts),
│   │                      format helpers
│   └── store/           ← Zustand store (localStorage persistence)
├── public/              ← static assets (source copy)
├── prisma/              ← Prisma schema (optional, not required to run)
├── package.json
├── next.config.ts       ← output: "standalone"
├── tsconfig.json
├── tailwind.config.ts / postcss.config.mjs
├── components.json      ← shadcn/ui config
└── eslint.config.mjs
```

## Quick start — run the prebuilt production server

Requires only **Node.js 18+** (no npm install, dependencies are bundled):

```bash
cd production
PORT=3000 HOSTNAME=0.0.0.0 node server.js
# open http://localhost:3000
```

## Run from source (development)

```bash
npm install        # or: bun install
npm run dev        # http://localhost:3000
```

## Rebuild production bundle

```bash
npm run build      # builds and copies static assets into .next/standalone
npm start          # runs the standalone server (uses bun; swap for node if preferred)
```

## Feature checklist

- **Home** — video grid with thumbnails/durations/view counts, Shorts shelf, 16 category filter chips, sticky header & responsive sidebar (full 240px / mini 72px / mobile drawer)
- **Watch** — custom video player: play/pause, scrub-able red progress bar with buffered track + hover time tooltip, volume, playback speed, quality menu, autoplay toggle, miniplayer, theater mode, fullscreen, keyboard shortcuts (k / m / f / t / j / l / arrows); like/dislike, subscribe + bell, expandable description, comments (sort / post / like / replies)
- **Shorts** — vertical snap-scroll feed, autoplay, like heart animation, mute toggle
- **Search** — live suggestion dropdown, results page (channels, videos, shorts, empty state)
- **Channels** — banner, avatar, tabs (Home / Videos / Shorts / About)
- **Library** — Subscriptions, History (with resume progress), Liked, Watch Later, Your Videos, You
- **Extras** — notifications dropdown, share dialog with clipboard copy, upload flow (publishes into feed), dark / light / system themes with exact YouTube palettes
- **Persistence** — likes, subscriptions, history, comments, watch later and uploads survive reload via Zustand + localStorage

All demo content is original; video streams use CC-licensed open-movie clips (Big Buck Bunny etc.).

## Quality gates (verified at packaging time)

- `tsc --noEmit` → **0 errors** in `src/`
- `eslint src/` → **0 errors, 0 warnings**
- `next build` (standalone, full type validation) → **compiled successfully**, 4/4 static pages
- Production server smoke test in a real browser → **0 console errors, 0 page errors, 0 hydration errors**; video playback, navigation, and theme toggle all re-verified
