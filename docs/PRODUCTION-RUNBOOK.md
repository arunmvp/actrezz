# Actrezz Production Runbook

## 1. Verify secrets without printing them

```powershell
npm run env:check
```

This only checks key presence and length. It does not print secret values.

## 2. Compress local videos for the R2 free tier

Quick sample:

```powershell
npm run videos:compress -- --sample 10 --target-gb 9.2
```

Full run:

```powershell
npm run videos:compress -- --target-gb 9.2
```

Input defaults to `C:\projects\actrezz\downloads`.
Output defaults to `C:\projects\actrezz\compressed-videos`.
The script keeps originals untouched and writes `compression-report.jsonl`.

## 3. Supabase database setup

Discover existing Supabase project or create a new one:

```powershell
npm run supabase:setup
```

If no `actrezz` project exists and you want the script to create it:

```powershell
npm run supabase:setup -- --create
```

Then run:

```powershell
npm run db:generate
npm run db:migrate:prod
psql "$env:DIRECT_URL" -f prisma/performance-indexes.sql
npm run db:import
npm run db:audit
```

Use the pooled Supabase URL for `DATABASE_URL` and direct 5432 URL for `DIRECT_URL`.

## 4. Cloudflare R2 setup

Bucket check/create:

```powershell
npm run cf:r2:setup
```

After `media.actrezz.online` DNS is ready:

```powershell
npm run cf:r2:setup -- --attach-domain
```

Public media should be served directly from R2/custom domain, not through a Worker.

## 5. Cache policy

Public catalogue pages use short edge cache with stale revalidate.
Admin/API auth routes are no-store.
Video files and thumbnails should be cached at Cloudflare/R2 with long browser and edge TTL after upload.

## 6. Local media and indexing audit

Run this before a local test build or before creating a production snapshot:

```powershell
npm run catalog:local
npm run media:audit
```

Only videos with a real playable file under `C:\projects\actrezz\downloads` are written into the local catalogue. Missing videos are excluded from UI, sitemap, video sitemap, latest, trending, notifications and related-video lists.

Indexing rules:

- Watch, actress, movie, TV-series, year and useful tag pages are indexable.
- Search, admin, API and empty shorts pages are noindex.
- One-video tag pages stay out of the normal sitemap and are noindex to avoid thin-page warnings.
- Video pages include canonical slugs, adult rating metadata, VideoObject JSON-LD and video sitemap entries.

## 7. Dynamic catalogue behaviour

Latest, trending, notifications, works, tags, years and related videos are derived from the current active catalogue. When a new video is added:

```powershell
npm run catalog:local
npm run thumbnails:local
npm run media:audit
npm run db:import
npm run db:audit
```

Then rebuild/redeploy. On production, R2 upload should happen first, followed by DB import and sitemap refresh.

## 8. Related videos

Production DB related videos are ranked by:

1. same movie or TV series
2. same actress
3. same tags
4. same year
5. latest fallback

The query is bounded and uses indexed joins, not a full public catalogue scan.
