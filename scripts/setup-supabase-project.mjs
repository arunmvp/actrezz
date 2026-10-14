import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const appRoot = process.cwd();
const envPath = path.join(appRoot, ".env.local");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return { values: {}, lines: [] };
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return { values, lines };
}

function setEnvValues(updates) {
  const parsed = parseEnvFile(envPath);
  const seen = new Set();
  const lines = parsed.lines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match || !(match[2] in updates)) return line;
    seen.add(match[2]);
    return `${match[1]}${match[2]}${match[3]}${updates[match[2]]}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(envPath, `${lines.join("\n").replace(/\n+$/g, "")}\n`);
}

function firstValue(env, ...names) {
  for (const name of names) {
    const value = env[name] || process.env[name];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function encodePassword(value) {
  return encodeURIComponent(value);
}

function generateDbPassword() {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

async function supabase(pathname, options = {}) {
  const response = await fetch(`https://api.supabase.com${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = json?.message || json?.error || json?.errors?.map?.((item) => item.message).join("; ") || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return json;
}

function normalizeOrganizations(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.organizations)) return payload.organizations;
  return [];
}

function normalizeProjects(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.projects)) return payload.projects;
  return [];
}

async function listOrganizations() {
  return normalizeOrganizations(await supabase("/v1/organizations"));
}

async function listProjectsForOrg(slug) {
  try {
    return normalizeProjects(await supabase(`/v1/organizations/${encodeURIComponent(slug)}/projects?limit=100`));
  } catch {
    return normalizeProjects(await supabase("/v1/projects"));
  }
}

function directConnectionUrl(ref, password) {
  const encoded = encodePassword(password);
  return `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`;
}

function fillPassword(connectionString, password) {
  const encoded = encodePassword(password);
  return connectionString
    .replace("[YOUR-PASSWORD]", encoded)
    .replace("%5BYOUR-PASSWORD%5D", encoded)
    .replace("<YOUR-PASSWORD>", encoded);
}

async function getPooledConnectionUrl(ref, password, preferredPort = "6543") {
  const poolers = normalizeProjects(await supabase(`/v1/projects/${encodeURIComponent(ref)}/config/database/pooler`));
  const transactionPooler = poolers.find((item) => String(item.db_port) === preferredPort) ||
    (preferredPort === "6543" ? poolers.find((item) => item.pool_mode === "transaction") : null) ||
    poolers[0];
  if (!transactionPooler) return "";
  const candidate = transactionPooler.connection_string || transactionPooler.connectionString;
  if (candidate) return `${fillPassword(candidate, password)}${candidate.includes("?") ? "&" : "?"}pgbouncer=true&connection_limit=1`;
  if (transactionPooler.db_host && transactionPooler.db_port && transactionPooler.db_user && transactionPooler.db_name) {
    return `postgresql://${encodeURIComponent(transactionPooler.db_user)}:${encodePassword(password)}@${transactionPooler.db_host}:${transactionPooler.db_port}/${transactionPooler.db_name}?pgbouncer=true&connection_limit=1`;
  }
  return "";
}

const { values: fileEnv } = parseEnvFile(envPath);
const env = { ...fileEnv, ...process.env };
const token = firstValue(env, "SUPABASE_ACCESS_TOKEN", "supabase_access_token");
const projectRefFromEnv = firstValue(env, "SUPABASE_PROJECT_REF");
const projectName = firstValue(env, "SUPABASE_PROJECT_NAME") || "actrezz";
const orgSlugFromEnv = firstValue(env, "SUPABASE_ORG_SLUG", "SUPABASE_ORGANIZATION_SLUG");
const regionGroup = firstValue(env, "SUPABASE_REGION_GROUP") || "apac";
const dbPasswordFromEnv = firstValue(env, "SUPABASE_DB_PASSWORD", "POSTGRES_PASSWORD");
const shouldCreate = process.argv.includes("--create");

if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or supabase_access_token in .env.local.");
  process.exit(1);
}

try {
  console.log("Reading Supabase organizations and projects");
  const organizations = await listOrganizations();
  if (!organizations.length) {
    console.error("No Supabase organizations were visible to this token.");
    process.exit(1);
  }

  const org = orgSlugFromEnv
    ? organizations.find((item) => item.slug === orgSlugFromEnv || item.id === orgSlugFromEnv)
    : organizations.length === 1 ? organizations[0] : null;

  if (!org) {
    console.log("Multiple Supabase organizations found. Set SUPABASE_ORG_SLUG in .env.local to one of these:");
    for (const item of organizations) console.log(`- ${item.name || item.slug}: ${item.slug || item.id}`);
    process.exit(1);
  }

  const orgSlug = org.slug || org.id;
  const projects = await listProjectsForOrg(orgSlug);
  const existing = projectRefFromEnv
    ? projects.find((item) => item.ref === projectRefFromEnv) || { ref: projectRefFromEnv, name: projectName, status: "unknown" }
    : projects.find((item) => item.name?.toLowerCase() === projectName.toLowerCase() || item.ref === projectName);

  let ref = existing?.ref;
  let dbPassword = dbPasswordFromEnv;

  if (!existing && !shouldCreate) {
    console.log(`No "${projectName}" project found. Re-run with --create to create it in organization ${orgSlug}.`);
    process.exit(1);
  }

  if (!existing) {
    dbPassword = generateDbPassword();
    console.log(`Creating Supabase project "${projectName}" in ${orgSlug}`);
    const created = await supabase("/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        organization_slug: orgSlug,
        db_pass: dbPassword,
        region_selection: { type: "smartGroup", code: regionGroup },
        desired_instance_size: "micro",
      }),
    });
    ref = created.ref || created.id || created.project?.ref;
    if (!ref) {
      console.error("Project creation response did not include a project ref.");
      process.exit(1);
    }
    console.log("Project create request accepted. It may take a few minutes to become healthy.");
  } else {
    console.log(`Found existing project "${existing.name}" (${existing.status || "status unknown"})`);
  }

  if (!dbPassword) {
    console.error("Existing project found, but database password is not available to the Management API. Add SUPABASE_DB_PASSWORD to .env.local or create a new project with --create.");
    process.exit(1);
  }

  const directUrl = directConnectionUrl(ref, dbPassword);
  let pooledUrl = "";
  let migrationUrl = "";
  try {
    pooledUrl = await getPooledConnectionUrl(ref, dbPassword, "6543");
    migrationUrl = await getPooledConnectionUrl(ref, dbPassword, "5432");
  } catch (error) {
    console.log(`Pooler config not available yet: ${error.message}`);
  }
  if (!pooledUrl) {
    pooledUrl = directUrl;
    console.log("Using direct DB URL for now. Re-run this script after the project is healthy to fill the pooled URL.");
  }
  if (!migrationUrl) migrationUrl = directUrl;
  setEnvValues({
    SUPABASE_PROJECT_REF: ref,
    SUPABASE_PROJECT_NAME: projectName,
    SUPABASE_ORG_SLUG: orgSlug,
    SUPABASE_REGION_GROUP: regionGroup,
    SUPABASE_DB_PASSWORD: dbPassword,
    DATABASE_URL: pooledUrl,
    DIRECT_URL: migrationUrl,
    NEXT_PUBLIC_SITE_URL: firstValue(env, "NEXT_PUBLIC_SITE_URL") || "https://actrezz.online",
    NEXT_PUBLIC_MEDIA_URL: firstValue(env, "NEXT_PUBLIC_MEDIA_URL") || "https://media.actrezz.online",
    R2_BUCKET_NAME: firstValue(env, "R2_BUCKET_NAME") || "actrezz-media",
  });

  console.log("Supabase project connection settings were written to .env.local. Secrets were not printed.");
  console.log(`Project ref: ${ref}`);
} catch (error) {
  console.error(`Supabase setup failed: ${error.message}`);
  process.exit(1);
}
