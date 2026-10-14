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

function firstValue(names) {
  for (const name of names) {
    if (env[name] && String(env[name]).trim()) return { name, value: String(env[name]).trim() };
  }
  return null;
}

const checks = [
  { label: "Supabase pooled DATABASE_URL", keys: ["DATABASE_URL"], required: true },
  { label: "Supabase direct DIRECT_URL", keys: ["DIRECT_URL"], required: true },
  { label: "Public site URL", keys: ["NEXT_PUBLIC_SITE_URL"], required: true },
  { label: "Public media URL", keys: ["NEXT_PUBLIC_MEDIA_URL"], required: true },
  { label: "Cloudflare account id", keys: ["R2_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID", "cloudflare_account_id"], required: true },
  { label: "Cloudflare API token", keys: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCESS_TOKEN", "cloudflare_access_token"], required: true },
  { label: "R2 S3 endpoint", keys: ["R2_ENDPOINT", "S3_API_ENDPOINT", "s3_api_endpoint"], required: true },
  { label: "R2 access key", keys: ["R2_ACCESS_KEY_ID", "access_key_id"], required: true },
  { label: "R2 secret key", keys: ["R2_SECRET_ACCESS_KEY", "secret_access_key"], required: true },
  { label: "R2 bucket name", keys: ["R2_BUCKET_NAME"], required: true },
  { label: "Admin email", keys: ["ADMIN_EMAIL"], required: true },
  { label: "Admin password", keys: ["ADMIN_PASSWORD"], required: true, minLength: 12 },
  { label: "Admin session secret", keys: ["ADMIN_SESSION_SECRET"], required: true, minLength: 32 },
];

let failed = false;
console.log(`Checking production env from ${fs.existsSync(envPath) ? envPath : "process environment"}`);
for (const check of checks) {
  const found = firstValue(check.keys);
  const ok = Boolean(found && (!check.minLength || found.value.length >= check.minLength));
  if (!ok && check.required) failed = true;
  const keyText = found ? found.name : check.keys.join(" | ");
  const suffix = check.minLength && found && found.value.length < check.minLength ? `, needs ${check.minLength}+ chars` : "";
  console.log(`${ok ? "OK " : "NO "} ${check.label} (${keyText}${suffix})`);
}

if (failed) {
  console.error("Production setup is not ready yet. Add the missing keys before DB migration, R2 upload, or deployment.");
  process.exit(1);
}

console.log("Production env has the required keys. Values were intentionally not printed.");
