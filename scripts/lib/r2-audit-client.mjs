import { createHash, createHmac } from "node:crypto";

const value = (...names) => names.map((name) => process.env[name]?.trim()).find(Boolean) || "";
const encode = (text) => encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key, text) => createHmac("sha256", key).update(text).digest();

export function signedR2(key, method = "HEAD") {
  const endpoint = value("R2_ENDPOINT", "S3_API_ENDPOINT", "s3_api_endpoint");
  const access = value("R2_ACCESS_KEY_ID", "access_key_id");
  const secret = value("R2_SECRET_ACCESS_KEY", "secret_access_key");
  const bucket = value("R2_BUCKET_NAME") || "actrezz-media";
  if (!endpoint || !access || !secret) throw new Error("Missing R2 credentials");
  const origin = new URL(endpoint);
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = stamp.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const uri = `/${bucket}/${key.split("/").map(encode).join("/")}`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": `${access}/${scope}`, "X-Amz-Date": stamp,
    "X-Amz-Expires": "300", "X-Amz-SignedHeaders": "host",
  });
  query.sort();
  const canonical = [method, uri, query.toString(), `host:${origin.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), "auto"), "s3"), "aws4_request");
  query.set("X-Amz-Signature", createHmac("sha256", signingKey).update(toSign).digest("hex"));
  return `${origin.origin}${uri}?${query}`;
}

export async function checkR2(key, range = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(signedR2(key, range ? "GET" : "HEAD"), {
        method: range ? "GET" : "HEAD", headers: range ? { Range: "bytes=0-0" } : {}, signal: AbortSignal.timeout(15000),
      });
      const result = { status: response.status, exists: response.ok, type: response.headers.get("content-type"),
        bytes: Number(response.headers.get("content-length") || 0), range: response.status === 206 && /^bytes 0-0\/\d+$/.test(response.headers.get("content-range") || "") };
      await response.body?.cancel();
      if (response.status >= 500 && attempt < 2) continue;
      if (!response.ok && response.status !== 404) throw new Error(`R2 check returned HTTP ${response.status}`);
      return result;
    } catch (error) { if (attempt === 2) throw error; }
  }
}
