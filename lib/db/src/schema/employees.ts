import { pgTable, text, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { departmentsTable } from "./admin";

export const employeesTable = pgTable("employees", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeCode: text("employee_code").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  gender: text("gender"),
  dateOfBirth: text("date_of_birth"),
  address: text("address"),
  emergencyContact: text("emergency_contact"),
  emergencyPhone: text("emergency_phone"),
  departmentId: text("department_id"),
  designationId: text("designation_id"),
  reportingManagerId: text("reporting_manager_id"),
  employmentType: text("employment_type").notNull().default("full_time"),
  joiningDate: text("joining_date").notNull(),
  probationEndDate: text("probation_end_date"),
  status: text("status").notNull().default("active"),
  lastWorkingDay: text("last_working_day"),
  resignationDate: text("resignation_date"),
  fnfStatus: text("fnf_status"),
  userId: text("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, employeeCode: true, createdAt: true, updatedAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;

export const employeeDocumentsTable = pgTable("employee_documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: text("verified_by"),
});

export type EmployeeDocument = typeof employeeDocumentsTable.$inferSelect;

export const employeeHistoryTable = pgTable("employee_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  changeType: text("change_type").notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  effectiveDate: text("effective_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by"),
});

export type EmployeeHistory = typeof employeeHistoryTable.$inferSelect;
