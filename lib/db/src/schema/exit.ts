import { mysqlTable, varchar, text, timestamp, boolean } from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const exitRequestsTable = mysqlTable("exit_requests", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }).unique(),
  resignationDate: varchar("resignation_date", { length: 20 }).notNull(),
  lastWorkingDay: varchar("last_working_day", { length: 20 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  managerComment: text("manager_comment"),
  exitInterviewNotes: text("exit_interview_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ExitRequest = typeof exitRequestsTable.$inferSelect;

export const exitChecklistItemsTable = mysqlTable("exit_checklist_items", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  exitRequestId: varchar("exit_request_id", { length: 36 }).notNull().references(() => exitRequestsTable.id, { onDelete: "cascade" }),
  task: varchar("task", { length: 255 }).notNull(),
  assignedTo: varchar("assigned_to", { length: 50 }).notNull().default("hr"),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
});

export type ExitChecklistItem = typeof exitChecklistItemsTable.$inferSelect;
