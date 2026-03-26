import { mysqlTable, varchar, text, timestamp, boolean, int } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const onboardingChecklistsTable = mysqlTable("onboarding_checklists", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type OnboardingChecklist = typeof onboardingChecklistsTable.$inferSelect;

export const onboardingTasksTable = mysqlTable("onboarding_tasks", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  checklistId: varchar("checklist_id", { length: 36 }).notNull().references(() => onboardingChecklistsTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  assignedTo: varchar("assigned_to", { length: 100 }).notNull(),
  assignedRole: varchar("assigned_role", { length: 50 }).notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  dueDate: varchar("due_date", { length: 20 }),
});

export type OnboardingTask = typeof onboardingTasksTable.$inferSelect;
