import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseConnection } from "../../src/lib/database-tls.mjs";

nextEnv.loadEnvConfig(process.cwd());
export function createDb(options = {}) {
  const { transactionOptions, ...clientOptions } = options;
  return new PrismaClient({
    ...clientOptions,
    adapter: new PrismaPg({ ...databaseConnection(), max: 5, connectionTimeoutMillis: 15000, idleTimeoutMillis: 1000 }),
    // Catalogue stat refreshes touch several large relation tables. The
    // Prisma default five-second interactive transaction window is too short
    // for a production import, even though every individual query is valid.
    transactionOptions: { maxWait: 10_000, timeout: 90_000, ...transactionOptions },
    errorFormat: "minimal",
  });
}
