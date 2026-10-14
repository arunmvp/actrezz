import { NextResponse } from "next/server";
import { jsonError, noStore, requireAdmin } from "@/lib/admin/catalog-admin";
import { listLocalImportJobs, startLocalImportJob, type LocalImportAction } from "@/lib/admin/local-import-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localOnly(request: Request) {
  const host = new URL(request.url).hostname.toLowerCase();
  return process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(host);
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return jsonError("Unauthorized.", 401);
  if (!localOnly(request)) return jsonError("Import Studio is available only from the local development admin.", 403);
  return noStore(NextResponse.json({ jobs: await listLocalImportJobs() }));
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return jsonError("Unauthorized.", 401);
  if (!localOnly(request)) return jsonError("Import Studio is available only from the local development admin.", 403);
  try {
    const body = await request.json() as { action?: LocalImportAction; videoFolder?: string; metadataFolder?: string; seedFolder?: string };
    if (!body.action || !["build", "prepare", "stage", "upload", "publish"].includes(body.action)) return jsonError("Choose a valid import action.");
    if (!body.videoFolder || !body.metadataFolder || !body.seedFolder) return jsonError("Analyze a batch before starting an action.");
    return noStore(NextResponse.json({ job: await startLocalImportJob({ action: body.action, videoFolder: body.videoFolder, metadataFolder: body.metadataFolder, seedFolder: body.seedFolder }) }, { status: 202 }));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to start import action.", 400);
  }
}
