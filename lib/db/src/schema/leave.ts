import { pgTable, text, timestamp, boolean, integer, numeric, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const leaveTypesTable = pgTable("leave_types", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  maxDaysPerYear: integer("max_days_per_year").notNull(),
  accrualPerMonth: real("accrual_per_month"),
  isCarryForward: boolean("is_carry_forward").notNull().default(false),
  maxCarryForward: integer("max_carry_forward"),
  isPaidLeave: boolean("is_paid_leave").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LeaveType = typeof leaveTypesTable.$inferSelect;

export const leaveBalancesTable = pgTable("leave_balances", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  leaveTypeId: text("leave_type_id").notNull().references(() => leaveTypesTable.id, { onDelete: "cascade" }),
  balance: real("balance").notNull().default(0),
  used: real("used").notNull().default(0),
  year: integer("year").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LeaveBalance = typeof leaveBalancesTable.$inferSelect;

export const leaveRequestsTable = pgTable("leave_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  leaveTypeId: text("leave_type_id").notNull().references(() => leaveTypesTable.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: real("days").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  managerComment: text("manager_comment"),
  approvedById: text("approved_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;

export const compoffsTable = pgTable("compoffs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  workDate: text("work_date").notNull(),
  creditDays: real("credit_days").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  expiryDate: text("expiry_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Compoff = typeof compoffsTable.$inferSelect;

export const leavePoliciesTable = pgTable("leave_policies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  leaveTypeId: text("leave_type_id").notNull().references(() => leaveTypesTable.id, { onDelete: "cascade" }).unique(),
  noLeaveInProbation: boolean("no_leave_in_probation").notNull().default(false),
  minNoticeDays: integer("min_notice_days").notNull().default(0),
  maxConsecutiveDays: integer("max_consecutive_days"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LeavePolicy = typeof leavePoliciesTable.$inferSelect;
