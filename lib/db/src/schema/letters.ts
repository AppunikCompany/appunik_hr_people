import { mysqlTable, varchar, text, timestamp, boolean, json } from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const letterTemplatesTable = mysqlTable("letter_templates", {
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

export const generatedLettersTable = mysqlTable("generated_letters", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  templateName: varchar("template_name", { length: 100 }).notNull(),
  generatedHtml: text("generated_html").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type GeneratedLetter = typeof generatedLettersTable.$inferSelect;
