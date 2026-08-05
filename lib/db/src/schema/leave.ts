import { mysqlTable, varchar, text, timestamp, boolean, int, double } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const leaveTypesTable = mysqlTable("people_leave_types", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  maxDaysPerYear: int("max_days_per_year").notNull(),
  accrualPerMonth: double("accrual_per_month"),
  isCarryForward: boolean("is_carry_forward").notNull().default(false),
  maxCarryForward: int("max_carry_forward"),
  isPaidLeave: boolean("is_paid_leave").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LeaveType = typeof leaveTypesTable.$inferSelect;

export const leaveBalancesTable = mysqlTable("people_leave_balances", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  leaveTypeId: varchar("leave_type_id", { length: 36 }).notNull().references(() => leaveTypesTable.id, { onDelete: "cascade" }),
  balance: double("balance").notNull().default(0),
  used: double("used").notNull().default(0),
  // Days carried forward from the previous year (0 if none). Included in balance.
  carriedForward: double("carried_forward").notNull().default(0),
  year: int("year").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LeaveBalance = typeof leaveBalancesTable.$inferSelect;

export const leaveRequestsTable = mysqlTable("people_leave_requests", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  leaveTypeId: varchar("leave_type_id", { length: 36 }).notNull().references(() => leaveTypesTable.id),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  endDate: varchar("end_date", { length: 20 }).notNull(),
  days: double("days").notNull(),
  isHalfDay: boolean("is_half_day").notNull().default(false),
  halfDayPeriod: varchar("half_day_period", { length: 20 }), // "half_day_morning" | "half_day_afternoon"
  isBackdated: boolean("is_backdated").notNull().default(false),
  medicalDocumentUrl: text("medical_document_url"),
  documentDeadlineAt: timestamp("document_deadline_at"), // when pending_doc must be uploaded by
  reason: text("reason"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  managerComment: text("manager_comment"),
  approvedById: varchar("approved_by_id", { length: 36 }),
  approvedByRole: varchar("approved_by_role", { length: 30 }), // "manager" | "hr_admin" | "super_admin"
  // ── Post-approval cancellation request (employee requests, HR approves/rejects) ──
  cancellationStatus: varchar("cancellation_status", { length: 20 }), // null | "pending" | "approved" | "rejected"
  cancellationReason: text("cancellation_reason"),
  cancellationRequestedAt: timestamp("cancellation_requested_at"),
  cancellationReviewedById: varchar("cancellation_reviewed_by_id", { length: 36 }),
  cancellationReviewNote: text("cancellation_review_note"),
  cancellationReviewedAt: timestamp("cancellation_reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;

export const compoffsTable = mysqlTable("people_compoffs", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  workDate: varchar("work_date", { length: 20 }).notNull(),
  creditDays: double("credit_days").notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  expiryDate: varchar("expiry_date", { length: 20 }),
  isUsed: boolean("is_used").notNull().default(false),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Compoff = typeof compoffsTable.$inferSelect;

export const leavePoliciesTable = mysqlTable("people_leave_policies", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  leaveTypeId: varchar("leave_type_id", { length: 36 }).notNull().references(() => leaveTypesTable.id, { onDelete: "cascade" }).unique(),
  noLeaveInProbation: boolean("no_leave_in_probation").notNull().default(false),
  minNoticeDays: int("min_notice_days").notNull().default(0),
  maxConsecutiveDays: int("max_consecutive_days"),
  documentDeadlineDays: int("document_deadline_days").notNull().default(3), // days after submission before pending_doc → lop
  notes: text("notes"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LeavePolicy = typeof leavePoliciesTable.$inferSelect;
