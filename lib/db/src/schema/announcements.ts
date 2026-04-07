import { mysqlTable, varchar, text, timestamp, boolean } from "drizzle-orm/mysql-core";

export const announcementsTable = mysqlTable("announcements", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 30 }).notNull().default("general"),
  isPinned: boolean("is_pinned").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  expiryDate: varchar("expiry_date", { length: 20 }),
  postedByUserId: varchar("posted_by_user_id", { length: 36 }),
  postedByName: varchar("posted_by_name", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Announcement = typeof announcementsTable.$inferSelect;
