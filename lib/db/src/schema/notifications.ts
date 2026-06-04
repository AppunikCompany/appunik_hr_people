import { mysqlTable, varchar, text, timestamp, boolean } from "drizzle-orm/mysql-core";

export const notificationsTable = mysqlTable("people_notifications", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Clerk userId of the recipient
  userId: varchar("user_id", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  // Frontend route to navigate when clicked (e.g. "/leave", "/attendance/my")
  link: varchar("link", { length: 500 }),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;
