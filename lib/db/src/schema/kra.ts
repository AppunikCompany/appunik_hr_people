import { mysqlTable, varchar, text, timestamp, boolean, int, double, json } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const kraTemplatesTable = mysqlTable("people_kra_templates", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  designation: varchar("designation", { length: 255 }),
  department: varchar("department", { length: 255 }),
  items: json("items").notNull().$type<Array<{title: string; weightage: number}>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type KraTemplate = typeof kraTemplatesTable.$inferSelect;

export const reviewCyclesTable = mysqlTable("people_review_cycles", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  cycleType: varchar("cycle_type", { length: 30 }).notNull().default("annual"),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  endDate: varchar("end_date", { length: 20 }).notNull(),
  closeDate: varchar("close_date", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ReviewCycle = typeof reviewCyclesTable.$inferSelect;

export const kraAssignmentsTable = mysqlTable("people_kra_assignments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  cycleId: varchar("cycle_id", { length: 36 }).notNull().references(() => reviewCyclesTable.id, { onDelete: "cascade" }),
  kraTitle: varchar("kra_title", { length: 255 }).notNull(),
  weightage: double("weightage").notNull(),
  target: text("target"),
  selfRating: double("self_rating"),
  selfComment: text("self_comment"),
  managerRating: double("manager_rating"),
  managerComment: text("manager_comment"),
  weightedScore: double("weighted_score"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type KraAssignment = typeof kraAssignmentsTable.$inferSelect;
