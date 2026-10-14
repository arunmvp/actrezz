import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { createR2UploadUrl, r2Ready } from "@/lib/r2-presign";
import { jsonError, noStore, requireAdmin } from "@/lib/admin/catalog-admin";

export const runtime = "nodejs";
export const maxDuration = 300;

type Command = { command: string; args: string[] };
type ImportInfo = {
  title?: string;
  description?: string;
  duration?: number;
  webpage_url?: string;
  thumbnail?: string;
  uploader?: string;
};

const MAX_SHORT_MB = Math.max(20, Math.min(Number(process.env.SHORT_IMPORT_MAX_MB) || 250, 1024));

function isLocalRequest(request: Request) {
  const host = request.headers.get("host") || "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
}

function twitterUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid Twitter/X video URL.");
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!["x.com", "twitter.com", "mobile.twitter.com"].includes(host)) {
    throw new Error("Only Twitter/X links are supported for this import.");
  }
  return url.toString();
}

function run(command: string, args: string[], options: { timeoutMs?: number; cwd?: string } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Twitter/X import timed out. Try a shorter video."));
    }, options.timeoutMs ?? 300000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk).slice(0, 20000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk).slice(0, 20000);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || stdout || `${command} exited with ${code}`).slice(-1600)));
    });
  });
}

async function findYtDlp(): Promise<Command> {
  const configured = process.env.YT_DLP_PATH?.trim();
  const candidates: Command[] = [
    ...(configured ? [{ command: configured, args: [] }] : []),
    { command: "yt-dlp", args: [] },
    { command: "yt-dlp.exe", args: [] },
    { command: "python", args: ["-m", "yt_dlp"] },
    { command: "py", args: ["-m", "yt_dlp"] },
  ];

  for (const candidate of candidates) {
    try {
      await run(candidate.command, [...candidate.args, "--version"], { timeoutMs: 15000 });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("yt-dlp is not installed. Install yt-dlp, then retry the Twitter/X import.");
}

async function findFfmpeg(): Promise<Command> {
  const configured = process.env.FFMPEG_PATH?.trim();
  const candidates: Command[] = [
    ...(configured ? [{ command: configured, args: [] }] : []),
    { command: "ffmpeg", args: [] },
    { command: "ffmpeg.exe", args: [] },
  ];

  for (const candidate of candidates) {
    try {
      await run(candidate.command, [...candidate.args, "-version"], { timeoutMs: 15000 });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("ffmpeg is not installed. Install ffmpeg or set FFMPEG_PATH so the short thumbnail can be generated automatically.");
}

async function listFiles(dir: string) {
  const files = await fsp.readdir(dir);
  const rows = await Promise.all(files.map(async (name) => {
    const filePath = path.join(dir, name);
    const stat = await fsp.stat(filePath);
    return { name, filePath, stat };
  }));
  return rows.filter((row) => row.stat.isFile());
}

type LocalFile = Awaited<ReturnType<typeof listFiles>>[number];

async function generateVideoThumbnail(videoPath: string, tempDir: string): Promise<LocalFile> {
  const ffmpeg = await findFfmpeg();
  const outputPath = path.join(tempDir, "twitter-short-auto-thumbnail.jpg");
  await run(ffmpeg.command, [
    ...ffmpeg.args,
    "-y",
    "-ss",
    "00:00:01",
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-vf",
    "scale=-2:720:force_original_aspect_ratio=decrease",
    "-q:v",
    "3",
    outputPath,
  ], { timeoutMs: 60000 });

  const stat = await fsp.stat(outputPath);
  if (!stat.size) throw new Error("Automatic thumbnail generation created an empty image.");
  return { name: path.basename(outputPath), filePath: outputPath, stat };
}

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  return "application/octet-stream";
}

async function uploadPathToR2(filePath: string, kind: "video" | "thumbnail") {
  const stat = await fsp.stat(filePath);
  const signed = createR2UploadUrl({ fileName: path.basename(filePath), kind, expiresSeconds: 3600 });
  const response = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: fs.createReadStream(filePath) as unknown as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`R2 upload failed (${response.status})${text ? `: ${text.slice(0, 240)}` : ""}`);
  }
  return signed;
}

async function downloadTwitterShort(url: string, tempDir: string) {
  const yt = await findYtDlp();
  const cookieFile = process.env.TWITTER_COOKIES_FILE || process.env.YT_DLP_COOKIES_FILE;
  const args = [
    ...yt.args,
    "--no-playlist",
    "--no-warnings",
    "--restrict-filenames",
    "--write-info-json",
    "--write-thumbnail",
    "--merge-output-format",
    "mp4",
    "--max-filesize",
    `${MAX_SHORT_MB}M`,
    "-f",
    "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4][height<=1080]/bv*[height<=1080]+ba/best[height<=1080]/best",
    "-o",
    path.join(tempDir, "twitter-short.%(ext)s"),
    ...(cookieFile ? ["--cookies", cookieFile] : []),
    url,
  ];
  await run(yt.command, args, { timeoutMs: 300000 });

  const files = await listFiles(tempDir);
  const video = files
    .filter((file) => /\.(mp4|m4v|webm|mov)$/i.test(file.name))
    .sort((a, b) => b.stat.size - a.stat.size)[0];
  if (!video) throw new Error("Twitter/X video file was not downloaded. Check that the link is public and contains a video.");
  if (video.stat.size > MAX_SHORT_MB * 1024 * 1024) throw new Error(`Short is larger than ${MAX_SHORT_MB}MB.`);

  const thumbnail = files
    .filter((file) => /\.(webp|jpg|jpeg|png)$/i.test(file.name))
    .sort((a, b) => b.stat.size - a.stat.size)[0] ?? null;
  const infoFile = files.find((file) => /\.info\.json$/i.test(file.name));
  let info: ImportInfo = {};
  if (infoFile) {
    info = JSON.parse(await fsp.readFile(infoFile.filePath, "utf8")) as ImportInfo;
  }

  return { video, thumbnail, info };
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return jsonError("Unauthorized.", 401);
  if (!r2Ready()) return jsonError("R2 upload credentials are not configured.", 503);
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_TWITTER_SHORT_IMPORT !== "true" && !isLocalRequest(request)) {
    return jsonError("Twitter/X import is disabled outside localhost. Set ENABLE_TWITTER_SHORT_IMPORT=true to enable it.", 403);
  }

  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  let url = "";
  try {
    url = twitterUrl(body?.url || "");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid Twitter/X URL.");
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "actrezz-twitter-short-"));
  try {
    const imported = await downloadTwitterShort(url, tempDir);
    const thumbnail = imported.thumbnail ?? await generateVideoThumbnail(imported.video.filePath, tempDir);
    const videoUpload = await uploadPathToR2(imported.video.filePath, "video");
    const thumbnailUpload = await uploadPathToR2(thumbnail.filePath, "thumbnail");
    return noStore(NextResponse.json({
      sourceUrl: imported.info.webpage_url || url,
      sourceProvider: "twitter",
      title: imported.info.title || "",
      description: imported.info.description || "",
      durationSeconds: imported.info.duration ? Math.round(imported.info.duration) : null,
      uploader: imported.info.uploader || "",
      video: {
        key: videoUpload.key,
        publicUrl: videoUpload.publicUrl,
        sizeBytes: imported.video.stat.size,
      },
      thumbnail: {
        key: thumbnailUpload.key,
        publicUrl: thumbnailUpload.publicUrl,
        sizeBytes: thumbnail.stat.size,
        generated: !imported.thumbnail,
      },
    }));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Twitter/X import failed.", 500);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
