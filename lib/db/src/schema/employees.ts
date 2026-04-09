import { mysqlTable, varchar, text, timestamp, boolean, int } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { departmentsTable } from "./admin";

export const employeesTable = mysqlTable("people_employees", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeCode: varchar("employee_code", { length: 20 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 30 }),
  gender: varchar("gender", { length: 20 }),
  dateOfBirth: varchar("date_of_birth", { length: 20 }),
  address: text("address"),
  emergencyContact: varchar("emergency_contact", { length: 100 }),
  emergencyPhone: varchar("emergency_phone", { length: 30 }),
  departmentId: varchar("department_id", { length: 36 }),
  designationId: varchar("designation_id", { length: 36 }),
  reportingManagerId: varchar("reporting_manager_id", { length: 36 }),
  employmentType: varchar("employment_type", { length: 30 }).notNull().default("full_time"),
  joiningDate: varchar("joining_date", { length: 20 }).notNull(),
  probationEndDate: varchar("probation_end_date", { length: 20 }),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  lastWorkingDay: varchar("last_working_day", { length: 20 }),
  resignationDate: varchar("resignation_date", { length: 20 }),
  fnfStatus: varchar("fnf_status", { length: 30 }),
  userId: varchar("user_id", { length: 36 }),
  zktecoMemberId: int("zkteco_member_id"),  // MEM 1, MEM 2… — matches device enrollment number
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, employeeCode: true, createdAt: true, updatedAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;

export const employeeDocumentsTable = mysqlTable("people_employee_documents", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: int("file_size"),
  expiryDate: varchar("expiry_date", { length: 20 }),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by", { length: 36 }),
});

export type EmployeeDocument = typeof employeeDocumentsTable.$inferSelect;

export const employeeHistoryTable = mysqlTable("people_employee_history", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  changeType: varchar("change_type", { length: 50 }).notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  effectiveDate: varchar("effective_date", { length: 20 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by", { length: 36 }),
});

export type EmployeeHistory = typeof employeeHistoryTable.$inferSelect;
