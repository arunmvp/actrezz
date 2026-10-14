import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  initialFor,
  jsonError,
  noStore,
  requireAdmin,
  sortValue,
  uniqueActressSlug,
  invalidateCatalog,
} from "@/lib/admin/catalog-admin";
import { actressInput } from "@/lib/admin/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return jsonError("Unauthorized.", 401);
  const parsed = actressInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "Invalid actress fields.");
  const body = parsed.data;
  const name = body?.name?.trim();
  if (!name || name.length < 2) return jsonError("Actress name is required.");

  const existing = await db.actress.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, slug: true, videoCount: true, profileImage: true },
  });
  if (existing) return noStore(NextResponse.json({ actress: existing, existed: true }));

  const actress = await db.actress.create({
    data: {
      name,
      slug: await uniqueActressSlug(name),
      sortName: sortValue(name),
      initial: initialFor(name),
      profileImage: body?.profileImage?.trim() || null,
      seoDescription: body?.seoDescription?.trim() || null,
      isPublished: true,
    },
    select: { id: true, name: true, slug: true, videoCount: true, profileImage: true },
  });
  invalidateCatalog();
  return noStore(NextResponse.json({ actress, existed: false }));
}
