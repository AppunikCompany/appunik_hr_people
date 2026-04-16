import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const schemaDir = path.join(rootDir, "lib/db/src/schema");
const migrationsDir = path.join(rootDir, "lib/db/drizzle");

const TABLE_REGEX = /mysqlTable\(\s*"([^"]+)"/g;
const FORBIDDEN_DDL_REGEX = /\b(rename|drop)\s+table\b/i;
const TABLE_REF_REGEX = /\b(?:into|update|from|join|table|alter\s+table)\s+`?([a-zA-Z0-9_]+)`?/gi;

async function readDirFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readDirFiles(entryPath)));
      continue;
    }
    files.push(entryPath);
  }
  return files;
}

function extractMatches(contents, regex) {
  const matches = [];
  let match = regex.exec(contents);
  while (match) {
    matches.push(match[1] ?? match[0]);
    match = regex.exec(contents);
  }
  return matches;
}

async function verifySchemaTables() {
  const files = (await readDirFiles(schemaDir)).filter((f) => f.endsWith(".ts"));
  const invalid = [];

  for (const file of files) {
    const contents = await readFile(file, "utf8");
    const tables = extractMatches(contents, new RegExp(TABLE_REGEX));
    for (const table of tables) {
      if (!table.startsWith("people_")) {
        invalid.push({ file, table });
      }
    }
  }

  if (invalid.length > 0) {
    console.error("Shared DB guard failed: non-people table names found in schema.");
    for (const item of invalid) {
      console.error(` - ${item.table} in ${path.relative(rootDir, item.file)}`);
    }
    process.exit(1);
  }
}

async function verifyMigrationSql() {
  let migrationsExists = false;
  try {
    const st = await stat(migrationsDir);
    migrationsExists = st.isDirectory();
  } catch {
    migrationsExists = false;
  }

  if (!migrationsExists) {
    return;
  }

  const sqlFiles = (await readDirFiles(migrationsDir)).filter((f) => f.endsWith(".sql"));
  for (const file of sqlFiles) {
    const contents = await readFile(file, "utf8");
    if (FORBIDDEN_DDL_REGEX.test(contents)) {
      console.error(`Shared DB guard failed: forbidden DDL (RENAME/DROP TABLE) in ${path.relative(rootDir, file)}.`);
      process.exit(1);
    }

    const tableRefs = extractMatches(contents, new RegExp(TABLE_REF_REGEX));
    const outsideScope = tableRefs.filter((name) => !name.toLowerCase().startsWith("people_"));
    if (outsideScope.length > 0) {
      console.error(`Shared DB guard failed: migration SQL references non-people table(s) in ${path.relative(rootDir, file)}.`);
      for (const table of [...new Set(outsideScope)]) {
        console.error(` - ${table}`);
      }
      process.exit(1);
    }
  }
}

await verifySchemaTables();
await verifyMigrationSql();
console.log("Shared DB guard passed: schema and migrations are scoped to people_* tables.");
