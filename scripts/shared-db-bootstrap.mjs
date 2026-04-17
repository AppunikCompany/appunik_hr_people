import mysql from "mysql2/promise";

const databaseUrl = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("MIGRATE_DATABASE_URL or DATABASE_URL is required for shared DB bootstrap.");
}

const statements = [
  `
  CREATE TABLE IF NOT EXISTS people_sessions (
    sid VARCHAR(255) PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS people_users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    profile_image_url VARCHAR(500),
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS people_roles (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_protected BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS people_role_permissions (
    id VARCHAR(36) PRIMARY KEY,
    role_id VARCHAR(36) NOT NULL,
    module VARCHAR(50) NOT NULL,
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_create BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete BOOLEAN NOT NULL DEFAULT FALSE
  )
  `,
];

const connection = await mysql.createConnection(databaseUrl);
try {
  for (const statement of statements) {
    await connection.execute(statement);
  }
  const [indexRows] = await connection.execute(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'people_sessions'
        AND index_name = 'IDX_session_expire'
    `,
  );
  const indexExists = Array.isArray(indexRows) && Number(indexRows[0]?.count ?? 0) > 0;
  if (!indexExists) {
    await connection.execute("CREATE INDEX IDX_session_expire ON people_sessions (expire)");
  }
  console.log(
    "Shared DB bootstrap complete: ensured people_sessions, people_users, people_roles, and people_role_permissions exist.",
  );
} finally {
  await connection.end();
}
