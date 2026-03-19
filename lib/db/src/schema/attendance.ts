import { pgTable, text, timestamp, boolean, integer, numeric, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const attendanceRecordsTable = pgTable("attendance_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  clockIn: timestamp("clock_in", { withTimezone: true }),
  clockOut: timestamp("clock_out", { withTimezone: true }),
  type: text("type").notNull().default("wfo"),
  hoursWorked: real("hours_worked"),
  isLate: boolean("is_late").notNull().default(false),
  isHalfDay: boolean("is_half_day").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;

export const overtimeLogsTable = pgTable("overtime_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  hours: real("hours").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OvertimeLog = typeof overtimeLogsTable.$inferSelect;

export const holidaysTable = pgTable("holidays", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull().default("national"),
  year: integer("year").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Holiday = typeof holidaysTable.$inferSelect;
