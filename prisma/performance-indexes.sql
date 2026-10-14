-- Run after the Prisma migration on PostgreSQL/Supabase.
-- These indexes match the exact public page filters and keep scans bounded.

CREATE INDEX IF NOT EXISTS idx_video_public_latest
  ON "Video" ("publishedAt" DESC NULLS LAST, id DESC)
  WHERE status = 'READY' AND "isShort" = FALSE;

CREATE INDEX IF NOT EXISTS idx_video_public_popular
  ON "Video" ("viewCount" DESC, id DESC)
  WHERE status = 'READY' AND "isShort" = FALSE;

CREATE INDEX IF NOT EXISTS idx_video_public_work
  ON "Video" ("workId", "publishedAt" DESC NULLS LAST, id DESC)
  WHERE status = 'READY' AND "isShort" = FALSE;

CREATE INDEX IF NOT EXISTS idx_video_public_year
  ON "Video" (year, "publishedAt" DESC NULLS LAST, id DESC)
  WHERE status = 'READY' AND "isShort" = FALSE;

CREATE INDEX IF NOT EXISTS idx_actress_public_directory
  ON "Actress" ("sortName", id)
  WHERE "isPublished" = TRUE AND "videoCount" > 0;

CREATE INDEX IF NOT EXISTS idx_work_public_directory
  ON "Work" (type, "sortTitle", id)
  WHERE "isPublished" = TRUE AND "videoCount" > 0;

CREATE INDEX IF NOT EXISTS idx_tag_public_directory
  ON "Tag" ("videoCount" DESC, name, id)
  WHERE "videoCount" > 0;

CREATE INDEX IF NOT EXISTS idx_video_search_vector
  ON "Video" USING GIN ("search_vector");

CREATE OR REPLACE FUNCTION actrezz_video_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_video_search_vector ON "Video";
CREATE TRIGGER trg_video_search_vector
BEFORE INSERT OR UPDATE OF title, description ON "Video"
FOR EACH ROW EXECUTE FUNCTION actrezz_video_search_vector_update();

UPDATE "Video" SET title = title WHERE "search_vector" IS NULL;
ANALYZE;
