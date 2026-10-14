-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('MOVIE', 'TV_SHOW');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'FAILED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "Actress" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortName" TEXT NOT NULL,
    "initial" VARCHAR(1) NOT NULL,
    "profileImage" TEXT,
    "biography" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "rank" INTEGER,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Actress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortTitle" TEXT NOT NULL,
    "initial" VARCHAR(1) NOT NULL,
    "type" "WorkType" NOT NULL,
    "releaseYear" INTEGER,
    "description" TEXT,
    "posterImage" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "durationSeconds" INTEGER,
    "year" INTEGER,
    "seasonNumber" INTEGER,
    "episodeNumber" INTEGER,
    "r2VideoKey" TEXT,
    "r2ThumbnailKey" TEXT,
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoKeywords" JSONB,
    "search_vector" tsvector,
    "status" "VideoStatus" NOT NULL DEFAULT 'DRAFT',
    "isShort" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" BIGINT NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workId" TEXT,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoActress" (
    "videoId" TEXT NOT NULL,
    "actressId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VideoActress_pkey" PRIMARY KEY ("videoId","actressId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "videoCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoTag" (
    "videoId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "VideoTag_pkey" PRIMARY KEY ("videoId","tagId")
);

-- CreateTable
CREATE TABLE "VideoSource" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourcePageUrl" TEXT,
    "sourceMediaUrl" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YearStat" (
    "year" INTEGER NOT NULL,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YearStat_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "CatalogStats" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "actressCount" INTEGER NOT NULL DEFAULT 0,
    "movieCount" INTEGER NOT NULL DEFAULT 0,
    "tvSeriesCount" INTEGER NOT NULL DEFAULT 0,
    "tagCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "doneItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Actress_slug_key" ON "Actress"("slug");

-- CreateIndex
CREATE INDEX "Actress_isPublished_sortName_id_idx" ON "Actress"("isPublished", "sortName", "id");

-- CreateIndex
CREATE INDEX "Actress_isPublished_rank_id_idx" ON "Actress"("isPublished", "rank", "id");

-- CreateIndex
CREATE INDEX "Actress_initial_sortName_id_idx" ON "Actress"("initial", "sortName", "id");

-- CreateIndex
CREATE INDEX "Work_isPublished_type_sortTitle_id_idx" ON "Work"("isPublished", "type", "sortTitle", "id");

-- CreateIndex
CREATE INDEX "Work_isPublished_type_releaseYear_id_idx" ON "Work"("isPublished", "type", "releaseYear", "id");

-- CreateIndex
CREATE INDEX "Work_type_initial_sortTitle_id_idx" ON "Work"("type", "initial", "sortTitle", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Work_type_slug_key" ON "Work"("type", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Video_slug_key" ON "Video"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Video_r2VideoKey_key" ON "Video"("r2VideoKey");

-- CreateIndex
CREATE INDEX "Video_status_isShort_publishedAt_id_idx" ON "Video"("status", "isShort", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "Video_status_workId_publishedAt_id_idx" ON "Video"("status", "workId", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "Video_status_year_publishedAt_id_idx" ON "Video"("status", "year", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "Video_status_viewCount_id_idx" ON "Video"("status", "viewCount", "id");

-- CreateIndex
CREATE INDEX "VideoActress_actressId_videoId_idx" ON "VideoActress"("actressId", "videoId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_videoCount_name_id_idx" ON "Tag"("videoCount", "name", "id");

-- CreateIndex
CREATE INDEX "VideoTag_tagId_videoId_idx" ON "VideoTag"("tagId", "videoId");

-- CreateIndex
CREATE INDEX "VideoSource_provider_importedAt_idx" ON "VideoSource"("provider", "importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSource_videoId_provider_key" ON "VideoSource"("videoId", "provider");

-- CreateIndex
CREATE INDEX "ImportJob_status_createdAt_idx" ON "ImportJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoActress" ADD CONSTRAINT "VideoActress_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoActress" ADD CONSTRAINT "VideoActress_actressId_fkey" FOREIGN KEY ("actressId") REFERENCES "Actress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag" ADD CONSTRAINT "VideoTag_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag" ADD CONSTRAINT "VideoTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSource" ADD CONSTRAINT "VideoSource_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

