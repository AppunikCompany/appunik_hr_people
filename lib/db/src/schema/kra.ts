import { pgTable, text, timestamp, boolean, integer, numeric, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const kraTemplatesTable = pgTable("kra_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  designation: text("designation"),
  department: text("department"),
  items: jsonb("items").notNull().$type<Array<{title: string; weightage: number}>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type KraTemplate = typeof kraTemplatesTable.$inferSelect;

export const reviewCyclesTable = pgTable("review_cycles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  cycleType: text("cycle_type").notNull().default("annual"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  closeDate: text("close_date").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ReviewCycle = typeof reviewCyclesTable.$inferSelect;

export const kraAssignmentsTable = pgTable("kra_assignments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  cycleId: text("cycle_id").notNull().references(() => reviewCyclesTable.id, { onDelete: "cascade" }),
  kraTitle: text("kra_title").notNull(),
  weightage: real("weightage").notNull(),
  target: text("target"),
  selfRating: real("self_rating"),
  selfComment: text("self_comment"),
  managerRating: real("manager_rating"),
  managerComment: text("manager_comment"),
  weightedScore: real("weighted_score"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type KraAssignment = typeof kraAssignmentsTable.$inferSelect;
