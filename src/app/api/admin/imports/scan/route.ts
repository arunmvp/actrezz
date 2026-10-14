import { access, readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, noStore, requireAdmin } from "@/lib/admin/catalog-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SeedVideo = {
  id: string;
  slug?: string;
  title?: string;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  r2ThumbnailKey?: string | null;
  r2VideoKey?: string | null;
  workId?: string | null;
  metadataSource?: { videocelebs?: string | null; description?: string | null; [key: string]: unknown } | null;
  descriptionSourceUrl?: string | null;
  videocelebsUrl?: string | null;
};

type SeedEntity = {
  id: string;
  slug: string;
  name?: string;
  title?: string;
  type?: string;
  profileImageKey?: string | null;
  profileSourceUrl?: string | null;
  profileSourceProvider?: string | null;
  profileUrl?: string | null;
};
type SeedLink = { videoId: string; actressId?: string; tagId?: string };
type SeedSource = { videoId: string; watchUrl?: string | null };
type Seed = { mode?: string; videos?: SeedVideo[]; actresses?: SeedEntity[]; works?: SeedEntity[]; tags?: SeedEntity[]; videoActresses?: SeedLink[]; videoTags?: SeedLink[]; videoSources?: SeedSource[] };
type MasterVideo = { video_url?: string; title?: string; description?: string | null; thumbnail_url?: string | null; video_file_url?: string | null };

const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mov", ".webm", ".mkv"]);
const MAX_FILES = 6_000;

function localOnly(request: Request) {
  const host = new URL(request.url).hostname.toLowerCase();
  return process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(host);
}

function importRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.LOCAL_IMPORT_ROOT || path.join(process.cwd(), "..", ".."));
}

function projectRoot() {
  return path.resolve(process.cwd(), "..");
}

async function isDirectory(value: string) {
  try { return (await stat(value)).isDirectory(); }
  catch { return false; }
}

function scopedPath(value: unknown, fallback: string) {
  const root = importRoot();
  const candidate = path.resolve(typeof value === "string" && value.trim() ? value.trim() : fallback);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Choose a folder inside C:\\projects (for example C:\\projects\\celeb or C:\\projects\\actrezz).");
  return candidate;
}

async function findFiles(root: string, matcher: (file: string) => boolean, output: string[] = []) : Promise<string[]> {
  if (output.length >= MAX_FILES) return output;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) await findFiles(fullPath, matcher, output);
    else if (entry.isFile() && matcher(fullPath)) output.push(fullPath);
    if (output.length >= MAX_FILES) break;
  }
  return output;
}

async function newestSeedFile(root: string, filename: string) {
  const matches = await findFiles(root, (file) => path.basename(file).toLowerCase() === filename.toLowerCase());
  const withStats = await Promise.all(matches.map(async (file) => ({ file, mtime: (await stat(file)).mtimeMs })));
  return withStats.sort((left, right) => right.mtime - left.mtime)[0]?.file;
}

async function readJson<T>(file: string | undefined) {
  if (!file) return null;
  try { return JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8")) as T; }
  catch { return null; }
}

function idFromVideoFile(file: string) {
  const name = path.basename(file, path.extname(file));
  return name.match(/(vid_[a-z0-9_-]+)/i)?.[1] || name;
}

function hostOf(value: unknown) {
  try { return new URL(String(value)).hostname.toLowerCase(); }
  catch { return ""; }
}

function isVideoCelebsUrl(value: unknown) {
  const host = hostOf(value);
  return host === "videocelebs.net" || host === "www.videocelebs.net";
}

function isAznudeUrl(value: unknown) {
  const host = hostOf(value);
  return host === "aznude.com" || host === "www.aznude.com" || /^cdn\d*\.aznude\.com$/i.test(host);
}

function descriptionSource(item: SeedVideo) {
  return item.metadataSource?.videocelebs || item.metadataSource?.description || item.descriptionSourceUrl || item.videocelebsUrl || null;
}

function sourceSlug(value: unknown) {
  try {
    const parts = new URL(String(value)).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}

/**
 * The master catalogue is deliberately analyzed separately from a generated
 * import seed. It is an authoritative local lookup table, not publishable
 * metadata: VideoCelebs facts and verified AZNude portraits are added while
 * building the production-safe seed. Keeping this scan read-only prevents a
 * folder selection from silently creating or changing catalogue records.
 */
async function scanMasterCatalog(input: {
  videoFiles: string[];
  videoFolder: string;
  metadataFolder: string;
  masterFile: string;
}) {
  const master = await readJson<MasterVideo[]>(input.masterFile);
  if (!Array.isArray(master) || !master.length) throw new Error("video_metadata_clean.json is missing or invalid.");

  const bySlug = new Map<string, MasterVideo[]>();
  for (const item of master) {
    const slug = sourceSlug(item.video_url);
    if (!slug) continue;
    const entries = bySlug.get(slug) || [];
    entries.push(item);
    bySlug.set(slug, entries);
  }

  const matches = input.videoFiles.map((file) => ({ file, slug: idFromVideoFile(file), entries: bySlug.get(idFromVideoFile(file)) || [] }));
  const ambiguous = matches.filter((item) => item.entries.length > 1);
  const unlinked = matches.filter((item) => item.entries.length === 0);
  const matched = matches.filter((item) => item.entries.length === 1).map((item) => ({ ...item, metadata: item.entries[0] }));

  // Supabase is the source of truth for production duplicates. A record is
  // protected when its canonical source page or public slug already exists.
  const [existingVideos, existingSources] = await Promise.all([
    db.video.findMany({ select: { slug: true } }),
    db.videoSource.findMany({ select: { sourcePageUrl: true } }),
  ]);
  const existingSlugs = new Set(existingVideos.map((item) => item.slug));
  const existingSourceUrls = new Set(existingSources.map((item) => item.sourcePageUrl).filter((item): item is string => Boolean(item)));
  const duplicates = matched.filter((item) => existingSlugs.has(item.slug) || Boolean(item.metadata.video_url && existingSourceUrls.has(item.metadata.video_url)));
  const duplicateFiles = new Set(duplicates.map((item) => item.file));
  const candidates = matched.filter((item) => !duplicateFiles.has(item.file));

  return noStore(NextResponse.json({
    localOnly: true,
    safeSeedReady: false,
    // Build is a job in its own right. Keep the master folder as its job
    // input so the admin action has a concrete, fingerprinted batch instead
    // of being rejected as though Analyze had never run.
    folders: { videoFolder: input.videoFolder, metadataFolder: input.metadataFolder, seedFolder: input.metadataFolder, seedFingerprint: createHash("sha256").update(await readFile(input.masterFile, "utf8")).digest("hex"), masterFile: input.masterFile },
    summary: {
      filesOnDisk: input.videoFiles.length,
      metadataVideos: master.length,
      matchedMetadata: matched.length,
      readyToPrepare: candidates.length,
      duplicates: duplicates.length,
      needsReview: ambiguous.length + unlinked.length + candidates.length,
    },
    media: { videoFiles: input.videoFiles.length, unlinkedFiles: unlinked.length, missingVideoFiles: 0, missingThumbnails: candidates.length },
    metadata: { missingDescriptions: candidates.length, newActresses: 0, newWorks: 0, newTags: 0 },
    sourcePolicy: {
      descriptions: { provider: "videocelebs.net", matched: 0, needsReview: candidates.length },
      actressProfiles: { provider: "aznude.com", verified: 0, needsReview: 0 },
      seo: { missingTitles: 0, missingDescriptions: candidates.length, missingKeywords: candidates.length },
    },
    samples: {
      ready: candidates.slice(0, 8).map((item) => ({ id: item.slug, title: item.metadata.title, slug: item.slug })),
      duplicates: duplicates.slice(0, 8).map((item) => ({ id: item.slug, title: item.metadata.title, slug: item.slug })),
      review: [
        ...unlinked.slice(0, 4).map((item) => ({ id: item.slug, title: path.basename(item.file), reason: "No master metadata match" })),
        ...ambiguous.slice(0, 4).map((item) => ({ id: item.slug, title: path.basename(item.file), reason: "More than one master metadata match" })),
        ...candidates.slice(0, 4).map((item) => ({ id: item.slug, title: item.metadata.title, reason: "Build the approved VideoCelebs/AZNude seed before preparing" })),
      ].slice(0, 10),
    },
  }));
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return jsonError("Unauthorized.", 401);
  if (!localOnly(request)) return jsonError("Import Studio is available only from the local development admin.", 403);

  let body: { folder?: string; metadataFolder?: string };
  try { body = await request.json(); }
  catch { return jsonError("Provide an import folder."); }

  try {
    const videoFolder = scopedPath(body.folder, path.join(projectRoot(), "downloads"));
    const metadataFolder = scopedPath(body.metadataFolder, path.join(projectRoot(), "data"));
    if (!(await isDirectory(videoFolder))) return jsonError("Video folder was not found.");
    if (!(await isDirectory(metadataFolder))) return jsonError("Metadata folder was not found.");

    const videoFiles = await findFiles(videoFolder, (file) => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()));
    const masterFile = path.join(metadataFolder, "video_metadata_clean.json");
    try {
      await access(masterFile);
      return await scanMasterCatalog({ videoFiles, videoFolder, metadataFolder, masterFile });
    } catch (error) {
      if (!(error instanceof Error) || !/ENOENT|not found/i.test(error.message)) throw error;
    }

    const [deltaFile, combinedFile] = await Promise.all([
      newestSeedFile(metadataFolder, "database-seed.delta.json"),
      newestSeedFile(metadataFolder, "database-seed.json"),
    ]);
    const [deltaText, delta, combined] = await Promise.all([
      deltaFile ? readFile(deltaFile, "utf8") : Promise.resolve(""),
      readJson<Seed>(deltaFile),
      readJson<Seed>(combinedFile),
    ]);
    if (!delta?.videos?.length || delta.mode !== "production-safe-delta") return jsonError("No production-safe database-seed.delta.json was found in the metadata folder.");
    if (!combined?.videos?.length) return jsonError("The matching database-seed.json is missing or incomplete.");
    const seedFolder = path.dirname(deltaFile!);
    const uiFile = path.join(seedFolder, "videos.ui.json");
    try { await access(uiFile); }
    catch { return jsonError("The selected seed is missing videos.ui.json, so thumbnails cannot be prepared safely."); }

    const [existingVideos, existingSources, existingActresses, existingWorks, existingTags] = await Promise.all([
      db.video.findMany({ select: { id: true, slug: true } }),
      db.videoSource.findMany({ select: { videoId: true, sourcePageUrl: true } }),
      db.actress.findMany({ select: { slug: true, profileImage: true } }),
      db.work.findMany({ select: { slug: true, type: true } }),
      db.tag.findMany({ select: { slug: true } }),
    ]);

    const identifiersOnDisk = new Set(videoFiles.map(idFromVideoFile));
    const existingIds = new Set(existingVideos.map((item) => item.id));
    const existingSlugs = new Set(existingVideos.map((item) => item.slug));
    const sourcesByUrl = new Set(existingSources.map((item) => item.sourcePageUrl).filter(Boolean));
    const sourceByVideo = new Map((delta.videoSources || []).map((item) => [item.videoId, item.watchUrl]));
    const deltaVideos = delta.videos;
    const seenIds = new Set<string>();
    const seenSlugs = new Set<string>();
    const seenSources = new Set<string>();
    const duplicateWithinBatch = new Set<string>();
    for (const item of deltaVideos) {
      const sourceUrl = sourceByVideo.get(item.id);
      if (seenIds.has(item.id) || (item.slug && seenSlugs.has(item.slug)) || (sourceUrl && seenSources.has(sourceUrl))) duplicateWithinBatch.add(item.id);
      seenIds.add(item.id);
      if (item.slug) seenSlugs.add(item.slug);
      if (sourceUrl) seenSources.add(sourceUrl);
    }
    const duplicates = deltaVideos.filter((item) => duplicateWithinBatch.has(item.id) || existingIds.has(item.id) || Boolean(item.slug && existingSlugs.has(item.slug)) || Boolean(sourceByVideo.get(item.id) && sourcesByUrl.has(sourceByVideo.get(item.id)!)));
    const videoExistsOnDisk = (item: SeedVideo) => identifiersOnDisk.has(item.id) || Boolean(item.slug && identifiersOnDisk.has(item.slug));
    const readyVideos = deltaVideos.filter((item) => !duplicates.includes(item) && videoExistsOnDisk(item));
    const missingVideoFiles = deltaVideos.filter((item) => !videoExistsOnDisk(item));
    const unlinkedFiles = videoFiles.filter((file) => {
      const identifier = idFromVideoFile(file);
      return !deltaVideos.some((item) => item.id === identifier || item.slug === identifier);
    });
    const missingDescriptions = readyVideos.filter((item) => !item.description?.trim() || !item.seoDescription?.trim());
    const descriptionSourceMismatches = readyVideos.filter((item) => !isVideoCelebsUrl(descriptionSource(item)));
    const missingSeoTitles = readyVideos.filter((item) => !item.seoTitle?.trim());
    const missingSeoKeywords = readyVideos.filter((item) => {
      const keywords = (item as SeedVideo & { seoKeywords?: unknown }).seoKeywords;
      return !Array.isArray(keywords) || keywords.length === 0;
    });
    const missingThumbnails = readyVideos.filter((item) => !item.r2ThumbnailKey);

    const combinedById = new Map((combined?.actresses || delta.actresses || []).map((item) => [item.id, item]));
    const relevantActresses = [...new Set((delta.videoActresses || []).map((item) => item.actressId).filter(Boolean))]
      .map((id) => combinedById.get(id!)).filter((item): item is SeedEntity => Boolean(item));
    const knownActresses = new Set(existingActresses.map((item) => item.slug));
    const newActresses = relevantActresses.filter((item) => !knownActresses.has(item.slug));
    const manifestFile = (await newestSeedFile(metadataFolder, "actress-profile-images.json")) || path.join(projectRoot(), "data", "actress-profile-images.json");
    const profileManifest = await readJson<Array<{ slug?: string; name?: string; status?: string; profileUrl?: string; sourcePageUrl?: string; sourceProvider?: string; path?: string }>>(manifestFile);
    const profileBySlug = new Map((profileManifest || []).filter((item) => item.status === "success").map((item) => [item.slug || item.name || "", item]));
    const profileChecks = await Promise.all(newActresses.map(async (item) => {
      const manifest = profileBySlug.get(item.slug);
      const url = item.profileSourceUrl || item.profileUrl || manifest?.sourcePageUrl || manifest?.profileUrl;
      const imageKey = manifest?.path || item.profileImageKey;
      if (!imageKey) return { item, valid: false };
      const relativeKey = String(imageKey).replace(/^media[\\/]/i, "");
      try { await access(path.join(projectRoot(), "media", relativeKey)); }
      catch { return { item, valid: false }; }
      return { item, valid: isAznudeUrl(url) };
    }));
    const missingVerifiedProfiles = profileChecks.filter((check) => !check.valid).map((check) => check.item);
    const combinedWorks = new Map((combined?.works || delta.works || []).map((item) => [item.id, item]));
    const relevantWorks = [...new Set(deltaVideos.map((item) => item.workId).filter(Boolean))].map((id) => combinedWorks.get(id!)).filter((item): item is SeedEntity => Boolean(item));
    const knownWorks = new Set(existingWorks.map((item) => `${item.type}:${item.slug}`));
    const newWorks = relevantWorks.filter((item) => !knownWorks.has(`${item.type}:${item.slug}`));
    const combinedTags = new Map((combined?.tags || delta.tags || []).map((item) => [item.id, item]));
    const relevantTags = [...new Set((delta.videoTags || []).map((item) => item.tagId).filter(Boolean))].map((id) => combinedTags.get(id!)).filter((item): item is SeedEntity => Boolean(item));
    const knownTags = new Set(existingTags.map((item) => item.slug));
    const newTags = relevantTags.filter((item) => !knownTags.has(item.slug));

    return noStore(NextResponse.json({
      localOnly: true,
      folders: { videoFolder, metadataFolder, seedFolder, seedFingerprint: createHash("sha256").update(deltaText).digest("hex"), seedFile: deltaFile, combinedSeedFile: combinedFile },
      summary: {
        filesOnDisk: videoFiles.length,
        metadataVideos: deltaVideos.length,
        readyToPrepare: Math.max(0, readyVideos.length - descriptionSourceMismatches.length - missingSeoTitles.length - missingSeoKeywords.length),
        duplicates: duplicates.length,
        needsReview: missingVideoFiles.length + unlinkedFiles.length + missingDescriptions.length + missingThumbnails.length + descriptionSourceMismatches.length + missingSeoTitles.length + missingSeoKeywords.length + missingVerifiedProfiles.length,
      },
      media: { videoFiles: videoFiles.length, unlinkedFiles: unlinkedFiles.length, missingVideoFiles: missingVideoFiles.length, missingThumbnails: missingThumbnails.length },
      metadata: { missingDescriptions: missingDescriptions.length, newActresses: newActresses.length, newWorks: newWorks.length, newTags: newTags.length },
      sourcePolicy: {
        descriptions: { provider: "videocelebs.net", matched: readyVideos.length - descriptionSourceMismatches.length, needsReview: descriptionSourceMismatches.length },
        actressProfiles: { provider: "aznude.com", verified: newActresses.length - missingVerifiedProfiles.length, needsReview: missingVerifiedProfiles.length },
        seo: { missingTitles: missingSeoTitles.length, missingDescriptions: missingDescriptions.length, missingKeywords: missingSeoKeywords.length },
      },
      samples: {
        ready: readyVideos.slice(0, 8).map((item) => ({ id: item.id, title: item.title, slug: item.slug })),
        duplicates: duplicates.slice(0, 8).map((item) => ({ id: item.id, title: item.title, slug: item.slug })),
        review: [
          ...missingVideoFiles.slice(0, 4).map((item) => ({ id: item.id, title: item.title, reason: "Video file missing" })),
          ...unlinkedFiles.slice(0, 4).map((file) => ({ id: idFromVideoFile(file), title: path.basename(file), reason: "No metadata match" })),
          ...missingDescriptions.slice(0, 4).map((item) => ({ id: item.id, title: item.title, reason: "Description needs review" })),
          ...descriptionSourceMismatches.slice(0, 4).map((item) => ({ id: item.id, title: item.title, reason: "Description source must be VideoCelebs" })),
          ...missingSeoTitles.slice(0, 2).map((item) => ({ id: item.id, title: item.title, reason: "SEO title missing" })),
          ...missingVerifiedProfiles.slice(0, 2).map((item) => ({ id: item.id, title: item.name, reason: "Verified AZNude profile image missing" })),
        ].slice(0, 10),
      },
    }));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to scan this import batch.", 400);
  }
}
