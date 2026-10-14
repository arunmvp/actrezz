import fs from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const envPath = path.join(appRoot, ".env.local");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    out[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const env = { ...parseEnvFile(envPath), ...process.env };
const accountId = env.R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || env.cloudflare_account_id;
const token = env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_ACCESS_TOKEN || env.cloudflare_access_token;
const bucketName = env.R2_BUCKET_NAME || "actrezz-media";
const mediaUrl = env.NEXT_PUBLIC_MEDIA_URL || "";
const mediaHost = mediaUrl.startsWith("http") ? new URL(mediaUrl).hostname : "";
const shouldAttachDomain = process.argv.includes("--attach-domain") && mediaHost;
const zoneName = mediaHost.split(".").slice(-2).join(".");

if (!accountId || !token) {
  console.error("Missing Cloudflare account/token. Set R2_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, or the lowercase aliases already in .env.local.");
  process.exit(1);
}

async function cf(pathname, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success === false) {
    const message = json?.errors?.map((item) => item.message).join("; ") || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return json;
}

async function main() {
  console.log(`Checking R2 bucket "${bucketName}"`);
  let bucketExists = false;
  try {
    await cf(`/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}`);
    bucketExists = true;
    console.log("OK bucket already exists");
  } catch (error) {
    if (!String(error.message).match(/not found|10007|No such bucket/i)) throw error;
  }

  if (!bucketExists) {
    await cf(`/accounts/${accountId}/r2/buckets`, {
      method: "POST",
      body: JSON.stringify({ name: bucketName, storageClass: "Standard" }),
    });
    console.log("OK bucket created");
  }

  if (shouldAttachDomain) {
    console.log(`Checking custom domain ${mediaHost}`);
    const domains = await cf(`/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/domains/custom`);
    const exists = domains?.result?.domains?.some((item) => item.domain === mediaHost) || domains?.result?.some?.((item) => item.domain === mediaHost);
    if (exists) {
      console.log("OK custom domain already attached");
    } else {
      const zones = await cf(`/zones?name=${encodeURIComponent(zoneName)}`);
      const zoneId = zones?.result?.[0]?.id || zones?.[0]?.id;
      if (!zoneId) throw new Error(`Could not find active Cloudflare zone for ${zoneName}.`);
      await cf(`/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/domains/custom`, {
        method: "POST",
        body: JSON.stringify({ domain: mediaHost, enabled: true, zoneId }),
      });
      console.log("OK custom domain attach requested. DNS/activation can take a little time.");
    }
  } else if (mediaHost) {
    console.log(`Skipped custom domain attach for ${mediaHost}. Re-run with --attach-domain when DNS is ready.`);
  } else {
    console.log("Skipped custom domain attach because NEXT_PUBLIC_MEDIA_URL is not set.");
  }

  console.log("Cloudflare R2 setup check complete.");
}

main().catch((error) => {
  const message = String(error.message || error);
  if (message.includes("enable R2")) {
    console.error("Cloudflare says R2 is not enabled on this account yet. Enable R2 once in the Cloudflare Dashboard, then re-run this script.");
  } else {
    console.error(`Cloudflare R2 setup failed: ${message}`);
  }
  process.exit(1);
});
