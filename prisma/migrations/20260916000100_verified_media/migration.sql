ALTER TABLE "Video" ADD COLUMN "mediaReady" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Video" ADD COLUMN "mediaCheckedAt" TIMESTAMP(3);

CREATE INDEX idx_video_verified_latest ON "Video" ("isShort", "publishedAt" DESC NULLS LAST, id DESC) WHERE status = 'READY' AND "mediaReady";
CREATE INDEX idx_video_verified_popular ON "Video" ("isShort", "viewCount" DESC, "publishedAt" DESC NULLS LAST, id DESC) WHERE status = 'READY' AND "mediaReady";
CREATE INDEX idx_video_verified_work ON "Video" ("workId", "isShort", "publishedAt" DESC NULLS LAST, id DESC) WHERE status = 'READY' AND "mediaReady";
CREATE INDEX idx_video_verified_year ON "Video" (year, "isShort", "publishedAt" DESC NULLS LAST, id DESC) WHERE status = 'READY' AND "mediaReady";
CREATE INDEX idx_video_admin_created ON "Video" ("createdAt" DESC, id DESC);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_video_title_trgm ON "Video" USING gin (title gin_trgm_ops);
CREATE INDEX idx_video_description_trgm ON "Video" USING gin (description gin_trgm_ops);
CREATE INDEX idx_actress_name_trgm ON "Actress" USING gin (name gin_trgm_ops);
CREATE INDEX idx_work_title_trgm ON "Work" USING gin (title gin_trgm_ops);
CREATE INDEX idx_tag_name_trgm ON "Tag" USING gin (name gin_trgm_ops);

-- Public access goes through the app, never the anonymous Supabase Data API.
ALTER TABLE "Video" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Actress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Work" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VideoActress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VideoTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VideoSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "YearStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CatalogStats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
