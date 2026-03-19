import { pgTable, text, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const departmentsTable = pgTable("departments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  headId: text("head_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Department = typeof departmentsTable.$inferSelect;

export const designationsTable = pgTable("designations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  departmentId: text("department_id"),
  level: integer("level"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Designation = typeof designationsTable.$inferSelect;

export const companyProfileTable = pgTable("company_profile", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  address: text("address"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CompanyProfile = typeof companyProfileTable.$inferSelect;

export const notificationSettingsTable = pgTable("notification_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventType: text("event_type").notNull().unique(),
  label: text("label").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type NotificationSetting = typeof notificationSettingsTable.$inferSelect;

export const financialYearConfigTable = pgTable("financial_year_config", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  startMonth: integer("start_month").notNull().default(4),
  startDay: integer("start_day").notNull().default(1),
  endMonth: integer("end_month").notNull().default(3),
  endDay: integer("end_day").notNull().default(31),
  currentYear: text("current_year").notNull().default("2025-26"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type FinancialYearConfig = typeof financialYearConfigTable.$inferSelect;
