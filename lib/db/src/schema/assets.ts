import { mysqlTable, varchar, text, timestamp, boolean, int, double } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const assetCategoriesTable = mysqlTable("people_asset_categories", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull().unique(),
  depreciationRate: double("depreciation_rate"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AssetCategory = typeof assetCategoriesTable.$inferSelect;

export const assetsTable = mysqlTable("people_assets", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  assetCode: varchar("asset_code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: varchar("category_id", { length: 36 }).notNull().references(() => assetCategoriesTable.id),
  serialNumber: varchar("serial_number", { length: 100 }),
  purchaseDate: varchar("purchase_date", { length: 20 }),
  purchaseCost: double("purchase_cost"),
  status: varchar("status", { length: 30 }).notNull().default("available"),
  condition: varchar("condition", { length: 50 }),
  assignedToId: varchar("assigned_to_id", { length: 36 }).references(() => employeesTable.id),
  assignedAt: timestamp("assigned_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Asset = typeof assetsTable.$inferSelect;

export const assetAssignmentsTable = mysqlTable("people_asset_assignments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  assetId: varchar("asset_id", { length: 36 }).notNull().references(() => assetsTable.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  returnedAt: timestamp("returned_at"),
  conditionOnReturn: varchar("condition_on_return", { length: 100 }),
  acknowledgedAt: timestamp("acknowledged_at"),
  notes: text("notes"),
});

export type AssetAssignment = typeof assetAssignmentsTable.$inferSelect;

// ── Employee Equipment (self-declared) ────────────────────────────────────────
// Employees declare what equipment they personally use at their workstation.
// Types: laptop | desktop | cpu | monitor | mouse | keyboard | headset |
//        webcam | printer | tablet | phone | other
export const employeeEquipmentTable = mysqlTable("people_employee_equipment", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  equipmentType: varchar("equipment_type", { length: 50 }).notNull(),
  // freetext label — always shown; required when type = "other"
  customDescription: varchar("custom_description", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type EmployeeEquipment = typeof employeeEquipmentTable.$inferSelect;
