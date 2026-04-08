import { mysqlTable, varchar, text, timestamp, double, int } from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const investmentDeclarationsTable = mysqlTable("people_investment_declarations", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  financialYear: varchar("financial_year", { length: 20 }).notNull(), // e.g. "2025-26"
  section: varchar("section", { length: 20 }).notNull(), // 80C, 80D, HRA, LTA, other
  category: varchar("category", { length: 100 }).notNull(), // PPF, ELSS, LIC, NPS, rent, etc.
  declaredAmount: double("declared_amount").notNull(),
  proofUrl: text("proof_url"),
  status: varchar("status", { length: 20 }).notNull().default("declared"), // declared, proof_submitted, verified, rejected
  verifiedById: varchar("verified_by_id", { length: 36 }),
  verifiedAt: timestamp("verified_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type InvestmentDeclaration = typeof investmentDeclarationsTable.$inferSelect;
