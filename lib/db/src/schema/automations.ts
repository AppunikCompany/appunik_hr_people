import { mysqlTable, varchar, text, timestamp, boolean, json } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailTemplatesTable = mysqlTable("email_templates", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  variables: json("variables").notNull().$type<string[]>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EmailTemplate = typeof emailTemplatesTable.$inferSelect;

export const automationRulesTable = mysqlTable("automation_rules", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  triggerType: varchar("trigger_type", { length: 30 }).notNull(),
  triggerEvent: varchar("trigger_event", { length: 100 }),
  cronExpr: varchar("cron_expr", { length: 50 }),
  templateId: varchar("template_id", { length: 36 }).notNull().references(() => emailTemplatesTable.id),
  recipients: varchar("recipients", { length: 50 }).notNull().default("employee"),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AutomationRule = typeof automationRulesTable.$inferSelect;

export const automationLogsTable = mysqlTable("automation_logs", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  ruleId: varchar("rule_id", { length: 36 }).notNull().references(() => automationRulesTable.id),
  employeeId: varchar("employee_id", { length: 36 }),
  templateCode: varchar("template_code", { length: 50 }).notNull(),
  recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export type AutomationLog = typeof automationLogsTable.$inferSelect;
