import "server-only";
import { createR2ReadUrl } from "@/lib/r2-presign";

export async function verifyPublishMedia(videoKey: string, thumbnailKey: string) {
  if (!videoKey || !thumbnailKey) throw new Error("Publishing requires an uploaded video and thumbnail. Save a draft until both are ready.");
  const [video, thumbnail] = await Promise.all([
    fetch(createR2ReadUrl(videoKey), { headers: { Range: "bytes=0-0" }, cache: "no-store", signal: AbortSignal.timeout(15000) }),
    fetch(createR2ReadUrl(thumbnailKey, 300, "HEAD"), { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(15000) }),
  ]);
  await video.body?.cancel();
  if (video.status !== 206 || !/^bytes 0-0\/\d+$/.test(video.headers.get("content-range") || "")) throw new Error("The uploaded video is missing or does not support seeking. Check the upload before publishing.");
  if (!thumbnail.ok || Number(thumbnail.headers.get("content-length")) <= 0) throw new Error("The thumbnail is missing. Upload a thumbnail before publishing.");
}
