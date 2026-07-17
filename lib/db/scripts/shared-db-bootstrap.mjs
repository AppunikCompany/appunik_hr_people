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

async function ensureLeaveRequestsColumns(connection) {
  // Skip if table doesn't exist yet (bootstrap will create it).
  const [tables] = await connection.execute("SHOW TABLES LIKE 'people_leave_requests'");
  if (tables.length === 0) return;

  const [rows] = await connection.execute("SHOW COLUMNS FROM `people_leave_requests`");
  const existing = new Set(rows.map((r) => r.Field));

  const missing = [
    { column: "is_half_day",            sql: "ADD COLUMN `is_half_day` TINYINT(1) NOT NULL DEFAULT 0 AFTER `days`" },
    { column: "half_day_period",         sql: "ADD COLUMN `half_day_period` VARCHAR(20) NULL AFTER `is_half_day`" },
    { column: "is_backdated",            sql: "ADD COLUMN `is_backdated` TINYINT(1) NOT NULL DEFAULT 0 AFTER `half_day_period`" },
    { column: "medical_document_url",    sql: "ADD COLUMN `medical_document_url` TEXT NULL AFTER `is_backdated`" },
    { column: "document_deadline_at",    sql: "ADD COLUMN `document_deadline_at` DATETIME NULL AFTER `medical_document_url`" },
    { column: "approved_by_role",         sql: "ADD COLUMN `approved_by_role` VARCHAR(30) NULL AFTER `approved_by_id`" },
  ].filter((c) => !existing.has(c.column));

  // Widen status column to VARCHAR(30) if still VARCHAR(20) — needed for 'pending_doc' and future statuses
  const statusCol = rows.find((r) => r.Field === "status");
  const alterParts = missing.map((c) => c.sql);
  if (statusCol && statusCol.Type === "varchar(20)") {
    alterParts.push("MODIFY COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'pending'");
  }

  if (alterParts.length === 0) return;
  await connection.execute(`ALTER TABLE \`people_leave_requests\` ${alterParts.join(", ")}`);
  console.log(`Updated people_leave_requests: ${[...missing.map((c) => c.column), statusCol?.Type === "varchar(20)" ? "status widened" : null].filter(Boolean).join(", ")}`);
}

async function ensureLeavePoliciesColumns(connection) {
  const [tables] = await connection.execute("SHOW TABLES LIKE 'people_leave_policies'");
  if (tables.length === 0) return;

  const [rows] = await connection.execute("SHOW COLUMNS FROM `people_leave_policies`");
  const existing = new Set(rows.map((r) => r.Field));

  const missing = [
    { column: "document_deadline_days", sql: "ADD COLUMN `document_deadline_days` INT NOT NULL DEFAULT 3 AFTER `max_consecutive_days`" },
  ].filter((c) => !existing.has(c.column));

  if (missing.length === 0) return;
  await connection.execute(`ALTER TABLE \`people_leave_policies\` ${missing.map((c) => c.sql).join(", ")}`);
  console.log(`Added missing columns to people_leave_policies: ${missing.map((c) => c.column).join(", ")}`);
}

async function ensureLeaveBalancesColumns(connection) {
  const [tables] = await connection.execute("SHOW TABLES LIKE 'people_leave_balances'");
  if (tables.length === 0) return;

  const [rows] = await connection.execute("SHOW COLUMNS FROM `people_leave_balances`");
  const existing = new Set(rows.map((r) => r.Field));

  const missing = [
    { column: "carried_forward", sql: "ADD COLUMN `carried_forward` DOUBLE NOT NULL DEFAULT 0 AFTER `used`" },
  ].filter((c) => !existing.has(c.column));

  if (missing.length === 0) return;
  await connection.execute(`ALTER TABLE \`people_leave_balances\` ${missing.map((c) => c.sql).join(", ")}`);
  console.log(`Added missing columns to people_leave_balances: ${missing.map((c) => c.column).join(", ")}`);
}

async function ensureAttendanceColumns(connection) {
  const [tables] = await connection.execute("SHOW TABLES LIKE 'people_attendance_records'");
  if (tables.length === 0) return;

  const [rows] = await connection.execute("SHOW COLUMNS FROM `people_attendance_records`");
  const existing = new Set(rows.map((r) => r.Field));

  const missing = [
    { column: "source", sql: "ADD COLUMN `source` VARCHAR(20) NOT NULL DEFAULT 'web' AFTER `type`" },
  ].filter((c) => !existing.has(c.column));

  if (missing.length === 0) return;
  await connection.execute(`ALTER TABLE \`people_attendance_records\` ${missing.map((c) => c.sql).join(", ")}`);
  console.log(`Added missing columns to people_attendance_records: ${missing.map((c) => c.column).join(", ")}`);
}

async function ensureEmployeesColumns(connection) {
  const [rows] = await connection.execute("SHOW COLUMNS FROM `people_employees`");
  const existing = new Set(rows.map((r) => r.Field));

  const missing = REQUIRED_COLUMNS.filter((c) => !existing.has(c.column));

  // Widen profile_image_url to TEXT if still VARCHAR(500) — needed for base64 photo uploads.
  const profileImageCol = rows.find((r) => r.Field === "profile_image_url");
  const alterParts = missing.map((c) => c.sql);
  if (profileImageCol && /varchar/i.test(profileImageCol.Type ?? "")) {
    alterParts.push("MODIFY COLUMN `profile_image_url` TEXT NULL");
  }

  if (alterParts.length === 0) return;
  const alterSql = `ALTER TABLE \`people_employees\` ${alterParts.join(", ")}`;
  await connection.execute(alterSql);
  console.log(`Updated people_employees: ${[...missing.map((c) => c.column), profileImageCol && /varchar/i.test(profileImageCol.Type ?? "") ? "profile_image_url widened to TEXT" : null].filter(Boolean).join(", ")}`);
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
  await ensureAttendanceColumns(connection);
  await ensureLeaveRequestsColumns(connection);
  await ensureLeavePoliciesColumns(connection);
  await ensureLeaveBalancesColumns(connection);

  // people_users is fully replaced by people_employees — drop it if it still exists.
  await connection.execute("DROP TABLE IF EXISTS `people_users`");
  console.log("Shared DB bootstrap complete: ensured all people_* tables exist and schema is up to date.");
} finally {
  await connection.end();
}
