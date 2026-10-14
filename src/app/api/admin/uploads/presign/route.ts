import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-auth";
import { createR2UploadUrl, r2Ready } from "@/lib/r2-presign";

export const runtime = "nodejs";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const isAdmin = await verifyAdminSession(cookieStore.get(ADMIN_COOKIE)?.value);
  if (!isAdmin) {
    return noStore(NextResponse.json({ error: "Unauthorized." }, { status: 401 }));
  }

  if (!r2Ready()) {
    return noStore(NextResponse.json({ error: "R2 upload credentials are not configured." }, { status: 503 }));
  }

  const body = (await request.json().catch(() => null)) as { fileName?: string; kind?: string } | null;
  const fileName = body?.fileName?.trim();
  const kind = body?.kind === "thumbnail" ? "thumbnail" : body?.kind === "video" ? "video" : null;

  if (!fileName || !kind) {
    return noStore(NextResponse.json({ error: "fileName and kind are required." }, { status: 400 }));
  }

  if (kind === "video" && !/\.(mp4|webm|mkv|mov|m4v)$/i.test(fileName)) {
    return noStore(NextResponse.json({ error: "Unsupported video file type." }, { status: 400 }));
  }
  if (kind === "thumbnail" && !/\.(webp|jpg|jpeg|png)$/i.test(fileName)) {
    return noStore(NextResponse.json({ error: "Unsupported thumbnail file type." }, { status: 400 }));
  }

  return noStore(NextResponse.json(createR2UploadUrl({ fileName, kind })));
}
