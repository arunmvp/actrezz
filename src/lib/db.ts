import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { databaseConnection } from "@/lib/database-tls.mjs";
import { cache } from "react";

const globalForPrisma = globalThis as unknown as { actrezzPrisma?: PrismaClient };

function createClient(worker: boolean) {
  const adapter = new PrismaPg({
    ...databaseConnection(),
    // Supabase's transaction pooler URL is provisioned with
    // `connection_limit=1`; a single shared connection avoids bursts of
    // parallel relation/count queries being rejected by the pooler.
    max: 1,
    // A Worker client is still created per request, so its socket is never
    // shared between visitors. Let the related-card/metadata queries in that
    // one request reuse the same pooler checkout instead of paying a new TLS
    // handshake for every relation query.
    // Prisma may issue one query for the cards plus small relation queries for
    // actresses, tags and works. Eight checkouts could expire in the middle of
    // a single public request, forcing the Worker to authenticate to Supavisor
    // again before it can return the response. Keep the same one-connection
    // ceiling, but allow the complete request chain to reuse that checkout.
    maxUses: worker ? 32 : Infinity,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000,
  });
  return new PrismaClient({ adapter, errorFormat: "minimal" });
}

// React's request cache gives server components/routes one client for the
// current request, without leaking a PostgreSQL pool across Worker requests.
const requestClient = cache(() => createClient(true));

function client() {
  let context;
  try { context = getCloudflareContext(); } catch { /* Standard Next.js dev/Node build. */ }
  if (context) return requestClient();
  return globalForPrisma.actrezzPrisma ??= createClient(false);
}

// Workers sockets must belong to the current request; Node reuses its small pool.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const current = client();
    const value = Reflect.get(current, property, current);
    return typeof value === "function" ? value.bind(current) : value;
  },
});
