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
  workPhone: varchar("work_phone", { length: 30 }),
  personalEmail: varchar("personal_email", { length: 255 }),
  gender: varchar("gender", { length: 20 }),
  dateOfBirth: varchar("date_of_birth", { length: 20 }),
  maritalStatus: varchar("marital_status", { length: 30 }),
  address: text("address"),
  currentLocation: varchar("current_location", { length: 255 }),
  emergencyContact: varchar("emergency_contact", { length: 100 }),
  emergencyPhone: varchar("emergency_phone", { length: 30 }),
  departmentId: varchar("department_id", { length: 36 }),
  designationId: varchar("designation_id", { length: 36 }),
  reportingManagerId: varchar("reporting_manager_id", { length: 36 }),
  employmentType: varchar("employment_type", { length: 30 }).notNull().default("full_time"),
  workLocation: varchar("work_location", { length: 100 }),
  seatingLocation: varchar("seating_location", { length: 100 }),
  sourceOfHire: varchar("source_of_hire", { length: 100 }),
  joiningDate: varchar("joining_date", { length: 20 }).notNull(),
  totalExperienceYears: varchar("total_experience_years", { length: 20 }),
  probationEndDate: varchar("probation_end_date", { length: 20 }),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  lastWorkingDay: varchar("last_working_day", { length: 20 }),
  resignationDate: varchar("resignation_date", { length: 20 }),
  dateOfExit: varchar("date_of_exit", { length: 20 }),
  fnfStatus: varchar("fnf_status", { length: 30 }),
  ctc: varchar("ctc", { length: 50 }),
  uanNumber: varchar("uan_number", { length: 30 }),
  panNumber: varchar("pan_number", { length: 20 }),
  aadhaarNumber: varchar("aadhaar_number", { length: 20 }),
  userId: varchar("user_id", { length: 36 }),
  zktecoMemberId: int("zkteco_member_id"),
  zktecoDisplayId: varchar("zkteco_display_id", { length: 20 }),
  role: varchar("role", { length: 50 }).notNull().default("employee"),
  profileImageUrl: text("profile_image_url"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
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

export const employeeExperienceTable = mysqlTable("people_employee_experience", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  jobTitle: varchar("job_title", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  endDate: varchar("end_date", { length: 20 }),
  isCurrent: boolean("is_current").notNull().default(false),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type EmployeeExperience = typeof employeeExperienceTable.$inferSelect;

export const employeeEducationTable = mysqlTable("people_employee_education", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  institution: varchar("institution", { length: 255 }).notNull(),
  degree: varchar("degree", { length: 255 }).notNull(),
  fieldOfStudy: varchar("field_of_study", { length: 255 }),
  startYear: varchar("start_year", { length: 4 }).notNull(),
  endYear: varchar("end_year", { length: 4 }),
  grade: varchar("grade", { length: 50 }),
  certificateUrl: text("certificate_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type EmployeeEducation = typeof employeeEducationTable.$inferSelect;
