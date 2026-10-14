# Actrezz production readiness

## Low-request architecture

- Pre-render public home, actress, movie, TV series, tag, year, and watch routes as static pages. Static asset requests should bypass the Worker; do not enable `run_worker_first` globally.
- Invoke Worker code only for admin/API operations, sitemap refreshes, and cache revalidation. Keep normal browsing at zero Worker invocations wherever possible.
- Cloudflare's current Workers Free hard limit is 100,000 Worker invocations per day. Static asset requests are free and unlimited when they do not invoke Worker code.
- Serve videos and thumbnails directly from the `media.actrezz.online` R2 custom domain. Never proxy video bytes through Next.js/Workers in production.
- R2 Standard includes 10 GB-month storage and 10 million Class B reads per month, with free egress. The current 20.85 GB video set exceeds only the free storage allowance; thumbnails are tiny by comparison.
- Public HTML has a 5-minute CDN freshness window and a 24-hour stale window. Admin publish actions must invalidate only the affected video, actress/work/tag/year pages and catalogue tags.

## Database gates

- Supabase Postgres is the source of truth; runtime uses its transaction pooler and migrations use `DIRECT_URL`.
- Public lists return 36 rows plus one cursor sentinel. No public request runs `COUNT(*)`.
- Search uses a GIN `tsvector`; `%LIKE%` is forbidden on the videos table.
- Import/publish jobs maintain `videoCount`, `YearStat`, and the single-row `CatalogStats` record.
- Run `prisma/performance-indexes.sql`, then `npm run db:audit`. A failed plan blocks deployment.

## Search and indexing

- Every video has a dedicated watch URL, visible `<video>` element, stable poster/content URLs, unique metadata, `VideoObject`, and video-sitemap entry.
- Movie, TV, actress, year, and useful tag pages have canonical URLs. Search/filter URLs are `noindex`; one-video tag pages are excluded from the normal sitemap to prevent thin index pages.
- Explicit pages use the adult rating metadata and video sitemap `family_friendly=no`.
- Use real titles/descriptions. Meta keywords are retained as supplemental metadata, but page copy, relationships, thumbnails, internal links, and VideoObject fields drive the indexing strategy.

## Admin security

- Production refuses local fallback credentials. Password and session secret minimums are enforced.
- Session cookies are HTTP-only, Secure in production, SameSite=Strict, eight-hour expiry, and HMAC signed.
- Login has origin validation, constant-time comparisons, delay, basic attempt limiting, and no-store responses.
- Put `/admin/*` behind Cloudflare Access before launch for a second independent authentication layer.

References: Cloudflare Workers limits and static-assets billing, Cloudflare R2 pricing, and Google Search Central video/explicit-content documentation.
