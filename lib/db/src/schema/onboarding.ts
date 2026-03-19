import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const onboardingChecklistsTable = pgTable("onboarding_checklists", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type OnboardingChecklist = typeof onboardingChecklistsTable.$inferSelect;

export const onboardingTasksTable = pgTable("onboarding_tasks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  checklistId: text("checklist_id").notNull().references(() => onboardingChecklistsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  assignedTo: text("assigned_to").notNull(),
  assignedRole: text("assigned_role").notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  dueDate: text("due_date"),
});

export type OnboardingTask = typeof onboardingTasksTable.$inferSelect;
