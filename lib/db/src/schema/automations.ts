import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailTemplatesTable = pgTable("email_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  variables: jsonb("variables").notNull().$type<string[]>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EmailTemplate = typeof emailTemplatesTable.$inferSelect;

export const automationRulesTable = pgTable("automation_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  triggerType: text("trigger_type").notNull(),
  triggerEvent: text("trigger_event"),
  cronExpr: text("cron_expr"),
  templateId: text("template_id").notNull().references(() => emailTemplatesTable.id),
  recipients: text("recipients").notNull().default("employee"),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AutomationRule = typeof automationRulesTable.$inferSelect;

export const automationLogsTable = pgTable("automation_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ruleId: text("rule_id").notNull().references(() => automationRulesTable.id),
  employeeId: text("employee_id"),
  templateCode: text("template_code").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AutomationLog = typeof automationLogsTable.$inferSelect;
