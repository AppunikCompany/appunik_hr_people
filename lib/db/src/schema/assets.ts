import { pgTable, text, timestamp, boolean, integer, numeric, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const assetCategoriesTable = pgTable("asset_categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  depreciationRate: real("depreciation_rate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AssetCategory = typeof assetCategoriesTable.$inferSelect;

export const assetsTable = pgTable("assets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  assetCode: text("asset_code").notNull().unique(),
  name: text("name").notNull(),
  categoryId: text("category_id").notNull().references(() => assetCategoriesTable.id),
  serialNumber: text("serial_number"),
  purchaseDate: text("purchase_date"),
  purchaseCost: real("purchase_cost"),
  status: text("status").notNull().default("available"),
  condition: text("condition"),
  assignedToId: text("assigned_to_id").references(() => employeesTable.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Asset = typeof assetsTable.$inferSelect;

export const assetAssignmentsTable = pgTable("asset_assignments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  assetId: text("asset_id").notNull().references(() => assetsTable.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  conditionOnReturn: text("condition_on_return"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  notes: text("notes"),
});

export type AssetAssignment = typeof assetAssignmentsTable.$inferSelect;
