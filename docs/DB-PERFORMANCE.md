# Actrezz database performance contract

Public requests must never calculate catalogue-wide counts or load unbounded relations. `videoCount` columns, `YearStat`, and the single-row `CatalogStats` table are refreshed by imports/admin publishing, not by visitors.

| Page | Maximum database statements on a cache miss | Rows returned |
| --- | ---: | ---: |
| Home / latest / popular | 1 | 37 (36 + cursor sentinel) |
| Actress, movie, series, tag or year listing | 2 | 1 entity + 37 videos |
| Actress / movie / series directories | 1 | 61 maximum |
| Tags / years directories | 1 | 61 maximum |
| Watch page | 2 | 1 video graph + at most 13 related videos |
| Search | 1 | 60 maximum through GIN `tsvector` |
| Header catalogue stats | 1 cached row | 1 |

Rules:

- No `COUNT(*)` is allowed in a public request.
- No `%term%` search over `Video`; use `search_vector` and the GIN index.
- Every list has `take <= 61` and cursor pagination. Never use an unbounded `include`.
- Related-video candidate IDs are capped before hydration.
- Apply `prisma/performance-indexes.sql` after migrations and run `ANALYZE`.
- Use the Supabase transaction pooler for runtime `DATABASE_URL`; use the direct URL only for migrations.
- Enable `DB_LOG_QUERIES=1` only during local audit. Before production, capture `EXPLAIN (ANALYZE, BUFFERS)` for each query and reject sequential scans on the large video/junction tables.

The previous `vidceleb` D1 issue came from full-table counts, substring filters, and unbounded junction-table candidates. This contract specifically prevents those patterns.
