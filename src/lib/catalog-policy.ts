import type { Prisma } from "@prisma/client";

export const PUBLIC_VIDEO_WHERE = { status: "READY", mediaReady: true } satisfies Prisma.VideoWhereInput;
export const CATALOG_CACHE = { revalidate: 300, tags: ["catalog"] };
