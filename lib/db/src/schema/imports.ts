import { mysqlTable, varchar, text, timestamp, int, json } from "drizzle-orm/mysql-core";

export const importLogsTable = mysqlTable("import_logs", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  importType: varchar("import_type", { length: 30 }).notNull(), // employees, assets, kra
  totalRows: int("total_rows").notNull().default(0),
  successCount: int("success_count").notNull().default(0),
  errorCount: int("error_count").notNull().default(0),
  errors: json("errors").$type<Array<{ row: number; error: string }>>(),
  importedBy: varchar("imported_by", { length: 36 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ImportLog = typeof importLogsTable.$inferSelect;
