import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type EmailBinding = {
  send(message: { to: string; from: string; replyTo?: string; subject: string; text: string }): Promise<{ messageId?: string }>;
};

const schema = z.object({
  claimantName: z.string().trim().min(2).max(120),
  organization: z.string().trim().max(160).optional().default(""),
  claimantEmail: z.string().trim().email().max(254),
  telephone: z.string().trim().min(5).max(40),
  mailingAddress: z.string().trim().min(10).max(600),
  rightsHolder: z.string().trim().min(2).max(200),
  copyrightedWork: z.string().trim().min(20).max(3000),
  materialUrls: z.string().trim().min(12).max(5000),
  additionalDetails: z.string().trim().max(3000).optional().default(""),
  signature: z.string().trim().min(2).max(120),
  goodFaith: z.literal("yes"),
  authorityConfirmed: z.literal("yes"),
  accuracyConfirmed: z.literal("yes"),
  website: z.string().max(0).optional().default(""),
  startedAt: z.number().int().positive(),
});

function response(body: object, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store, max-age=0");
  result.headers.set("X-Robots-Tag", "noindex, nofollow");
  return result;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function hashIp(value: string) {
  const secret = process.env.ADMIN_SESSION_SECRET || "actrezz-dmca";
  const bytes = new TextEncoder().encode(`${secret}:${value}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((item) => item.toString(16).padStart(2, "0")).join("");
}

function emailBinding() {
  try {
    const context = getCloudflareContext() as unknown as { env?: { DMCA_EMAIL?: EmailBinding } };
    return context.env?.DMCA_EMAIL;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return response({ error: "JSON request required." }, 415);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "Complete every required field and verify the notice statements." }, 400);

  const data = parsed.data;
  const elapsed = Date.now() - data.startedAt;
  if (data.website || elapsed < 2500 || elapsed > 2 * 60 * 60 * 1000) return response({ error: "Please reload the page and try again." }, 400);

  const rawIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const ipHash = await hashIp(rawIp);
  const recent = await db.dmcaRequest.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recent >= 3) return response({ error: "Too many recent requests. Please try again later." }, 429);

  const claim = await db.dmcaRequest.create({
    data: {
      claimantName: data.claimantName,
      organization: data.organization || null,
      claimantEmail: data.claimantEmail,
      telephone: data.telephone,
      mailingAddress: data.mailingAddress,
      rightsHolder: data.rightsHolder,
      copyrightedWork: data.copyrightedWork,
      materialUrls: data.materialUrls,
      additionalDetails: data.additionalDetails || null,
      signature: data.signature,
      ipHash,
      userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
    },
    select: { id: true, createdAt: true },
  });

  const recipient = process.env.DMCA_RECIPIENT_EMAIL;
  const sender = process.env.DMCA_FROM_EMAIL || "notices@actrezz.online";
  const binding = emailBinding();
  if (recipient && binding) {
    const text = [
      `New Actrezz copyright notice: ${claim.id}`,
      `Received: ${claim.createdAt.toISOString()}`,
      "",
      `Claimant: ${data.claimantName}`,
      `Organisation: ${data.organization || "Not supplied"}`,
      `Claimant email: ${data.claimantEmail}`,
      `Telephone: ${data.telephone}`,
      `Mailing address: ${data.mailingAddress}`,
      `Rights holder: ${data.rightsHolder}`,
      "",
      "Copyrighted work:", data.copyrightedWork,
      "", "Actrezz URL(s):", data.materialUrls,
      "", "Additional details:", data.additionalDetails || "Not supplied",
      "", `Electronic signature: ${data.signature}`,
      "Declarations: good faith, authority, accuracy and penalty-of-perjury statements accepted.",
    ].join("\n");
    try {
      const delivery = await binding.send({ to: recipient, from: sender, replyTo: data.claimantEmail, subject: `Actrezz DMCA notice ${claim.id}`, text });
      await db.dmcaRequest.update({ where: { id: claim.id }, data: { emailDeliveryStatus: "SENT", emailMessageId: delivery.messageId || null } });
    } catch {
      await db.dmcaRequest.update({ where: { id: claim.id }, data: { emailDeliveryStatus: "FAILED" } });
    }
  } else {
    await db.dmcaRequest.update({ where: { id: claim.id }, data: { emailDeliveryStatus: "NOT_CONFIGURED" } });
  }

  return response({ ok: true, reference: claim.id }, 201);
}
