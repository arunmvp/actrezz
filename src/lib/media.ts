// One URL policy for the public catalogue and admin previews.
export function mediaUrl(key?: string | null) {
  if (!key) return "";
  if (/^https?:\/\//i.test(key) || key.startsWith("/api/")) return key;
  const base = (process.env.NEXT_PUBLIC_MEDIA_URL || "/api/r2-media").replace(/\/+$/, "");
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function videoMedia(row: { id: string; r2VideoKey?: string | null; r2ThumbnailKey?: string | null; videoUrl?: string | null; thumbnailUrl?: string | null }) {
  return {
    videoUrl: mediaUrl(row.r2VideoKey || row.videoUrl || `videos/${row.id}.mp4`),
    thumbnailUrl: mediaUrl(row.r2ThumbnailKey || row.thumbnailUrl || `thumbnails/${row.id}.webp`),
  };
}
