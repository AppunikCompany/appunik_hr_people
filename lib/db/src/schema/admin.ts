import { mysqlTable, varchar, text, timestamp, boolean, int } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const departmentsTable = mysqlTable("departments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull().unique(),
  headId: varchar("head_id", { length: 36 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Department = typeof departmentsTable.$inferSelect;

export const designationsTable = mysqlTable("designations", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  departmentId: varchar("department_id", { length: 36 }),
  level: int("level"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Designation = typeof designationsTable.$inferSelect;

export const companyProfileTable = mysqlTable("company_profile", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  logoUrl: text("logo_url"),
  address: text("address"),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 30 }),
  website: varchar("website", { length: 255 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CompanyProfile = typeof companyProfileTable.$inferSelect;

export const notificationSettingsTable = mysqlTable("notification_settings", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventType: varchar("event_type", { length: 100 }).notNull().unique(),
  label: varchar("label", { length: 255 }).notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type NotificationSetting = typeof notificationSettingsTable.$inferSelect;

export const financialYearConfigTable = mysqlTable("financial_year_config", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  startMonth: int("start_month").notNull().default(4),
  startDay: int("start_day").notNull().default(1),
  endMonth: int("end_month").notNull().default(3),
  endDay: int("end_day").notNull().default(31),
  currentYear: varchar("current_year", { length: 20 }).notNull().default("2025-26"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type FinancialYearConfig = typeof financialYearConfigTable.$inferSelect;

export const appConfigTable = mysqlTable("app_config", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AppConfig = typeof appConfigTable.$inferSelect;

export const rolesTable = mysqlTable("roles", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
  isSystem: boolean("is_system").notNull().default(false),
  isProtected: boolean("is_protected").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Role = typeof rolesTable.$inferSelect;

export const rolePermissionsTable = mysqlTable("role_permissions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  roleId: varchar("role_id", { length: 36 }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  canView: boolean("can_view").notNull().default(false),
  canCreate: boolean("can_create").notNull().default(false),
  canEdit: boolean("can_edit").notNull().default(false),
  canDelete: boolean("can_delete").notNull().default(false),
});

export type RolePermission = typeof rolePermissionsTable.$inferSelect;
