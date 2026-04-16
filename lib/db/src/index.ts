import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

/** Used only during `next build` when routes are loaded but no DB is provisioned. */
const BUILD_PLACEHOLDER_DATABASE_URL =
  "mysql://build:build@127.0.0.1:3306/build";

function assertNonPlaceholderDatabaseUrl(url: string): void {
  try {
    const parsed = new URL(url);
    const hasPlaceholderCreds =
      parsed.username === "user" ||
      parsed.password === "password" ||
      parsed.hostname === "host";
    const hasPlaceholderDb = parsed.pathname === "/hr_suite";

    if (hasPlaceholderCreds || hasPlaceholderDb) {
      throw new Error(
        'DATABASE_URL appears to use placeholder values. Set a real connection string like "mysql://hr_people_app:***@db-host:3306/appunik".',
      );
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "DATABASE_URL is not a valid URL. Expected format: mysql://user:pass@host:3306/database",
      );
    }
    throw error;
  }
}

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) {
    assertNonPlaceholderDatabaseUrl(url);
    return url;
  }

  // Next.js preloads route modules during production build; avoid failing on import.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return BUILD_PLACEHOLDER_DATABASE_URL;
  }

  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = resolveDatabaseUrl();

export const pool = mysql.createPool(databaseUrl);
export const db = drizzle(pool, { schema, mode: "default" });

export * from "./schema";
