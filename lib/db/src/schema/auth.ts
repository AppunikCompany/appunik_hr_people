import { mysqlTable, varchar, json, timestamp, index } from "drizzle-orm/mysql-core";

// (IMPORTANT) This table is mandatory for session management, don't drop it.
export const sessionsTable = mysqlTable(
  "people_sessions",
  {
    sid: varchar("sid", { length: 255 }).primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);
