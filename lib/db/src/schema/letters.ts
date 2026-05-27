import { mysqlTable, varchar, text, mediumtext, timestamp, boolean, json } from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const letterTemplatesTable = mysqlTable("people_letter_templates", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  bodyHtml: text("body_html").notNull(),
  variables: json("variables").notNull().$type<string[]>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LetterTemplate = typeof letterTemplatesTable.$inferSelect;

export const generatedLettersTable = mysqlTable("people_generated_letters", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  templateName: varchar("template_name", { length: 100 }).notNull(),
  generatedHtml: text("generated_html").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type GeneratedLetter = typeof generatedLettersTable.$inferSelect;

// ── Company Documents (policies, handbooks — visible to all employees) ──────
export const companyDocumentsTable = mysqlTable("people_company_documents", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  // general | policy | handbook | sop | other
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileData: mediumtext("file_data").notNull(), // base64-encoded file
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  uploadedByUserId: varchar("uploaded_by_user_id", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CompanyDocument = typeof companyDocumentsTable.$inferSelect;

// ── HR Employee Letters (files uploaded by HR for a specific employee) ────────
// Separate from people_employee_documents (ID proofs/certs) — these are
// HR-issued letters: offer letters, appointment letters, salary slips, etc.
export const hrEmployeeLettersTable = mysqlTable("people_hr_employee_letters", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull().default("other"),
  // offer_letter | appointment_letter | experience_letter | salary_slip | nda | other
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileData: mediumtext("file_data").notNull(), // base64-encoded file
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  uploadedByUserId: varchar("uploaded_by_user_id", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type HrEmployeeLetter = typeof hrEmployeeLettersTable.$inferSelect;
