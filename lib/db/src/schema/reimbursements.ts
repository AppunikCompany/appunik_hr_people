import { mysqlTable, varchar, text, timestamp, double } from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const reimbursementsTable = mysqlTable("reimbursements", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 50 }).notNull(), // travel, food, medical, office_supplies, other
  amount: double("amount").notNull(),
  description: text("description"),
  receiptUrl: text("receipt_url"),
  expenseDate: varchar("expense_date", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, approved, rejected, paid
  reviewedById: varchar("reviewed_by_id", { length: 36 }),
  reviewedAt: timestamp("reviewed_at"),
  reviewComment: text("review_comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Reimbursement = typeof reimbursementsTable.$inferSelect;
