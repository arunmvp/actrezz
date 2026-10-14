import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function slugFileName(fileName: string) {
  const [base = "upload", ext = "mp4"] = fileName.split(/(?=\.[^.]+$)/);
  const cleanBase = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload";
  const cleanExt = ext.replace(/[^a-z0-9.]/gi, "").toLowerCase() || ".mp4";
  return `${cleanBase}${cleanExt.startsWith(".") ? cleanExt : `.${cleanExt}`}`;
}

export function r2Ready() {
  return Boolean(
    envValue("R2_ENDPOINT", "S3_API_ENDPOINT", "s3_api_endpoint") &&
    envValue("R2_ACCESS_KEY_ID", "access_key_id") &&
    envValue("R2_SECRET_ACCESS_KEY", "secret_access_key")
  );
}

export function createR2UploadUrl(options: {
  fileName: string;
  kind: "video" | "thumbnail";
  expiresSeconds?: number;
}) {
  const endpoint = envValue("R2_ENDPOINT", "S3_API_ENDPOINT", "s3_api_endpoint");
  const accessKeyId = envValue("R2_ACCESS_KEY_ID", "access_key_id");
  const secretAccessKey = envValue("R2_SECRET_ACCESS_KEY", "secret_access_key");
  const bucket = envValue("R2_BUCKET_NAME") || "actrezz-media";
  const publicMediaUrl = envValue("NEXT_PUBLIC_MEDIA_URL").replace(/\/+$/, "");

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 upload credentials are not configured.");
  }

  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = `${dateStamp}T${now.toISOString().slice(11, 19).replace(/:/g, "")}Z`;
  const expires = Math.max(60, Math.min(options.expiresSeconds ?? 900, 3600));
  const safeName = slugFileName(options.fileName);
  const key = `${options.kind === "video" ? "videos" : "thumbnails"}/${dateStamp}/${randomUUID()}-${safeName}`;
  const endpointUrl = new URL(endpoint);
  const canonicalUri = `/${bucket}/${key.split("/").map(encodePathSegment).join("/")}`;
  const host = endpointUrl.host;
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  });
  query.sort();

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    query.toString(),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), "auto"), "s3"), "aws4_request");
  const signature = hmacHex(signingKey, stringToSign);
  query.set("X-Amz-Signature", signature);

  const uploadUrl = `${endpointUrl.origin}${canonicalUri}?${query.toString()}`;
  const publicUrl = publicMediaUrl ? `${publicMediaUrl}/${key.split("/").map(encodePathSegment).join("/")}` : "";
  return { key, uploadUrl, publicUrl, expiresSeconds: expires };
}

export function createR2ReadUrl(key: string, expiresSeconds = 900, method: "GET" | "HEAD" = "GET") {
  const endpoint = envValue("R2_ENDPOINT", "S3_API_ENDPOINT", "s3_api_endpoint");
  const accessKeyId = envValue("R2_ACCESS_KEY_ID", "access_key_id");
  const secretAccessKey = envValue("R2_SECRET_ACCESS_KEY", "secret_access_key");
  const bucket = envValue("R2_BUCKET_NAME") || "actrezz-media";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 read credentials are not configured.");
  }

  const cleanKey = key.replace(/^\/+/, "");
  if (!cleanKey || cleanKey.includes("..") || cleanKey.includes("\\")) {
    throw new Error("Invalid R2 object key.");
  }

  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = `${dateStamp}T${now.toISOString().slice(11, 19).replace(/:/g, "")}Z`;
  const expires = Math.max(60, Math.min(expiresSeconds, 3600));
  const endpointUrl = new URL(endpoint);
  const canonicalUri = `/${bucket}/${cleanKey.split("/").map(encodePathSegment).join("/")}`;
  const host = endpointUrl.host;
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  });
  query.sort();

  const canonicalRequest = [
    method,
    canonicalUri,
    query.toString(),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), "auto"), "s3"), "aws4_request");
  const signature = hmacHex(signingKey, stringToSign);
  query.set("X-Amz-Signature", signature);

  return `${endpointUrl.origin}${canonicalUri}?${query.toString()}`;
}
