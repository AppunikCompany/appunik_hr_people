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

// Columns that must exist on people_employees — added safely if missing.
const REQUIRED_COLUMNS = [
  { column: "role",                   sql: "ADD COLUMN `role` VARCHAR(50) NOT NULL DEFAULT 'employee'" },
  { column: "profile_image_url",      sql: "ADD COLUMN `profile_image_url` VARCHAR(500) NULL" },
  { column: "onboarding_completed",   sql: "ADD COLUMN `onboarding_completed` TINYINT(1) NOT NULL DEFAULT 0" },
  { column: "onboarding_completed_at",sql: "ADD COLUMN `onboarding_completed_at` DATETIME NULL" },
];

async function ensureEmployeesColumns(connection) {
  const [rows] = await connection.execute("SHOW COLUMNS FROM `people_employees`");
  const existing = new Set(rows.map((r) => r.Field));

  const missing = REQUIRED_COLUMNS.filter((c) => !existing.has(c.column));
  if (missing.length === 0) return;

  const alterSql = `ALTER TABLE \`people_employees\` ${missing.map((c) => c.sql).join(", ")}`;
  await connection.execute(alterSql);
  console.log(`Added missing columns to people_employees: ${missing.map((c) => c.column).join(", ")}`);
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

  // Ensure new columns exist on tables that may have been created before the schema update.
  await ensureEmployeesColumns(connection);

  // people_users is fully replaced by people_employees — drop it if it still exists.
  await connection.execute("DROP TABLE IF EXISTS `people_users`");
  console.log("Shared DB bootstrap complete: ensured all people_* tables exist and schema is up to date.");
} finally {
  await connection.end();
}
