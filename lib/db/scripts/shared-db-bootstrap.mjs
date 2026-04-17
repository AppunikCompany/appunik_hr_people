import mysql from "mysql2/promise";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const databaseUrl = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("MIGRATE_DATABASE_URL or DATABASE_URL is required for shared DB bootstrap.");
}

async function loadCreateTableStatements() {
  const { stdout, stderr } = await execFileAsync(
    "pnpm",
    ["exec", "drizzle-kit", "export", "--config", "./drizzle.config.ts"],
    { cwd: process.cwd(), env: process.env },
  );
  if (stderr?.trim()) {
    console.warn(stderr.trim());
  }

  return stdout
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
    .filter((statement) => /^CREATE TABLE\s+`people_/i.test(statement))
    .map((statement) => statement.replace(/^CREATE TABLE/i, "CREATE TABLE IF NOT EXISTS"));
}

const connection = await mysql.createConnection(databaseUrl);
try {
  const statements = await loadCreateTableStatements();
  if (statements.length === 0) {
    throw new Error(
      "No CREATE TABLE statements were generated from Drizzle schema export.",
    );
  }
  for (const statement of statements) {
    await connection.execute(statement);
  }
  console.log("Shared DB bootstrap complete: ensured all people_* tables exist (create-only mode).");
} finally {
  await connection.end();
}
