import { mysqlTable, varchar, text, timestamp, boolean, int, double } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const attendanceRecordsTable = mysqlTable("people_attendance_records", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 20 }).notNull(),
  clockIn: timestamp("clock_in"),
  clockOut: timestamp("clock_out"),
  type: varchar("type", { length: 20 }).notNull().default("wfo"),
  hoursWorked: double("hours_worked"),
  isLate: boolean("is_late").notNull().default(false),
  isHalfDay: boolean("is_half_day").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;

export const overtimeLogsTable = mysqlTable("people_overtime_logs", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 20 }).notNull(),
  hours: double("hours").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OvertimeLog = typeof overtimeLogsTable.$inferSelect;

export const holidaysTable = mysqlTable("people_holidays", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  date: varchar("date", { length: 20 }).notNull(),
  type: varchar("type", { length: 30 }).notNull().default("national"),
  year: int("year").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Holiday = typeof holidaysTable.$inferSelect;
