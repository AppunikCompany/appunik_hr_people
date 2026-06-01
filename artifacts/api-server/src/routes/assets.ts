import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  assetsTable,
  assetCategoriesTable,
  assetAssignmentsTable,
  employeeEquipmentTable,
  employeesTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { isPrivileged } from "../lib/ownership";
import { fireAutomationEvent } from "../lib/automations";
import { importLogsTable } from "@workspace/db";

const router: IRouter = Router();

async function nextAssetCode(): Promise<string> {
  const all = await db.select({ code: assetsTable.assetCode }).from(assetsTable);
  const nums = all
    .map((a) => parseInt(a.code.replace("AST-", ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `AST-${String(next).padStart(3, "0")}`;
}

async function enrichAsset(asset: typeof assetsTable.$inferSelect) {
  const [cat] = await db.select().from(assetCategoriesTable).where(eq(assetCategoriesTable.id, asset.categoryId));
  let assignedToName: string | null = null;
  if (asset.assignedToId) {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, asset.assignedToId));
    assignedToName = emp ? `${emp.firstName} ${emp.lastName}` : null;
  }
  return {
    ...asset,
    categoryName: cat?.name ?? "",
    assignedToName,
    assignedAt: asset.assignedAt?.toISOString() ?? null,
  };
}

router.get("/assets/categories", requireAuth, async (_req, res) => {
  try {
    const cats = await db.select().from(assetCategoriesTable);
    res.json(cats);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/assets/categories", requireAuth, requireRole("super_admin", "hr_admin", "it_admin"), async (req, res) => {
  try {
    const catId = crypto.randomUUID();
    await db.insert(assetCategoriesTable).values({ ...req.body, id: catId });
    const [cat] = await db.select().from(assetCategoriesTable).where(eq(assetCategoriesTable.id, catId));
    res.status(201).json(cat);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/assets", requireAuth, async (req, res) => {
  try {
    const { status, category, assignedTo } = req.query as Record<string, string>;
    let assets = await db.select().from(assetsTable);
    if (status) assets = assets.filter((a) => a.status === status);
    if (category) assets = assets.filter((a) => a.categoryId === category);
    if (assignedTo) assets = assets.filter((a) => a.assignedToId === assignedTo);
    const enriched = await Promise.all(assets.map(enrichAsset));
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/assets", requireAuth, requireRole("super_admin", "hr_admin", "it_admin"), async (req, res) => {
  try {
    const code = await nextAssetCode();
    const astId = crypto.randomUUID();
    await db.insert(assetsTable).values({ ...req.body, id: astId, assetCode: code, status: "available" });
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, astId));
    res.status(201).json(await enrichAsset(asset));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── BI-07: Asset inventory bulk export as CSV ──
router.get("/assets/export", requireAuth, requireRole("super_admin", "hr_admin", "it_admin"), async (_req, res): Promise<void> => {
  try {
    const assets = await db.select().from(assetsTable);
    const categories = await db.select().from(assetCategoriesTable);
    const employees = await db.select().from(employeesTable);
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const empMap = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

    const headers = ["Asset Code", "Name", "Category", "Serial Number", "Status", "Assigned To", "Purchase Date", "Purchase Cost", "Condition"];
    const rows = assets.map((a) => [
      a.assetCode,
      a.name,
      catMap.get(a.categoryId) ?? "",
      a.serialNumber ?? "",
      a.status,
      a.assignedToId ? (empMap.get(a.assignedToId) ?? "") : "",
      a.purchaseDate ?? "",
      a.purchaseCost ?? "",
      a.condition ?? "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`));

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=asset_inventory.csv");
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/assets/:id", requireAuth, async (req, res) => {
  try {
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, (req.params.id as string)));
    if (!asset) { res.status(404).json({ error: "Not found" }); return; }
    res.json(await enrichAsset(asset));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/assets/:id", requireAuth, requireRole("super_admin", "hr_admin", "it_admin"), async (req, res) => {
  try {
    await db.update(assetsTable).set(req.body).where(eq(assetsTable.id, (req.params.id as string)));
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, (req.params.id as string)));
    if (!asset) { res.status(404).json({ error: "Not found" }); return; }
    res.json(await enrichAsset(asset));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/assets/:id/assign", requireAuth, requireRole("super_admin", "hr_admin", "it_admin"), async (req, res) => {
  try {
    const { employeeId, notes } = req.body as { employeeId: string; notes?: string };
    const now = new Date();

    const [existing] = await db.select().from(assetsTable).where(eq(assetsTable.id, (req.params.id as string)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.status === "assigned") {
      res.status(400).json({ error: "Asset is already assigned. Return it before re-assigning." });
      return;
    }

    await db.update(assetsTable).set({ status: "assigned", assignedToId: employeeId, assignedAt: now }).where(eq(assetsTable.id, (req.params.id as string)));
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, (req.params.id as string)));

    if (!asset) { res.status(404).json({ error: "Not found" }); return; }

    const assignId = crypto.randomUUID();
    await db.insert(assetAssignmentsTable).values({ id: assignId, assetId: (req.params.id as string), employeeId, notes });
    const [assignment] = await db.select().from(assetAssignmentsTable).where(eq(assetAssignmentsTable.id, assignId));

    fireAutomationEvent({
      event: "asset.assigned",
      employeeId,
      variables: { assetName: asset.name, assetCode: asset.assetCode },
    }).catch(console.error);

    res.json(assignment);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/assets/:id/return", requireAuth, requireRole("super_admin", "hr_admin", "it_admin"), async (req, res) => {
  try {
    const { condition, notes } = req.body as { condition?: string; notes?: string };

    const [existing] = await db.select().from(assetsTable).where(eq(assetsTable.id, (req.params.id as string)));
    const prevEmployeeId = existing?.assignedToId;

    await db.update(assetsTable).set({ status: "available", assignedToId: null, assignedAt: null, condition: condition ?? undefined }).where(eq(assetsTable.id, (req.params.id as string)));
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, (req.params.id as string)));

    if (!asset) { res.status(404).json({ error: "Not found" }); return; }

    if (prevEmployeeId) {
      fireAutomationEvent({
        event: "asset.returned",
        employeeId: prevEmployeeId,
        variables: { assetName: asset.name, assetCode: asset.assetCode },
      }).catch(console.error);
    }

    res.json(await enrichAsset(asset));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AM-08: Asset acknowledgment — employee confirms receipt ──
router.post("/assets/:id/acknowledge", requireAuth, async (req, res): Promise<void> => {
  try {
    const assetId = req.params.id as string;
    // Find the latest unacknowledged assignment for this asset
    const assignments = await db.select().from(assetAssignmentsTable)
      .where(and(eq(assetAssignmentsTable.assetId, assetId), isNull(assetAssignmentsTable.returnedAt)));
    const latest = assignments[assignments.length - 1];
    if (!latest) { res.status(404).json({ error: "No active assignment found for this asset" }); return; }
    if (latest.acknowledgedAt) { res.status(400).json({ error: "Already acknowledged" }); return; }

    await db.update(assetAssignmentsTable).set({ acknowledgedAt: new Date() }).where(eq(assetAssignmentsTable.id, latest.id));
    const [updated] = await db.select().from(assetAssignmentsTable).where(eq(assetAssignmentsTable.id, latest.id));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AM-09: Depreciation tracking ──
router.get("/assets/:id/depreciation", requireAuth, async (req, res): Promise<void> => {
  try {
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, (req.params.id as string)));
    if (!asset) { res.status(404).json({ error: "Not found" }); return; }

    const [cat] = await db.select().from(assetCategoriesTable).where(eq(assetCategoriesTable.id, asset.categoryId));
    const rate = cat?.depreciationRate ?? 0; // annual percentage
    const cost = asset.purchaseCost ?? 0;

    if (!asset.purchaseDate || cost === 0) {
      res.json({ assetId: asset.id, purchaseCost: cost, currentValue: cost, depreciatedAmount: 0, yearsOwned: 0, annualRate: rate });
      return;
    }

    const purchaseDate = new Date(asset.purchaseDate);
    const yearsOwned = (Date.now() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    // Straight-line depreciation
    const depreciatedAmount = Math.min(cost, cost * (rate / 100) * yearsOwned);
    const currentValue = Math.max(0, cost - depreciatedAmount);

    res.json({
      assetId: asset.id,
      assetCode: asset.assetCode,
      name: asset.name,
      purchaseCost: cost,
      purchaseDate: asset.purchaseDate,
      annualRate: rate,
      yearsOwned: Math.round(yearsOwned * 10) / 10,
      depreciatedAmount: Math.round(depreciatedAmount * 100) / 100,
      currentValue: Math.round(currentValue * 100) / 100,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AM-12 / BI-06: Bulk asset import ──
router.post("/assets/import", requireAuth, requireRole("super_admin", "hr_admin", "it_admin"), async (req, res): Promise<void> => {
  try {
    const { rows } = req.body as { rows: Record<string, string>[] };
    if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "No rows provided" }); return; }

    const categories = await db.select().from(assetCategoriesTable);
    const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

    const results: Array<{ row: number; status: "created" | "error"; error?: string; assetCode?: string }> = [];
    let created = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const name = row["Name"]?.trim();
        const categoryName = row["Category"]?.trim();
        if (!name) { results.push({ row: i + 1, status: "error", error: "Name is required" }); errors++; continue; }
        if (!categoryName) { results.push({ row: i + 1, status: "error", error: "Category is required" }); errors++; continue; }

        const categoryId = catByName.get(categoryName.toLowerCase());
        if (!categoryId) { results.push({ row: i + 1, status: "error", error: `Category "${categoryName}" not found` }); errors++; continue; }

        const code = await nextAssetCode();
        const astId = crypto.randomUUID();
        await db.insert(assetsTable).values({
          id: astId,
          assetCode: code,
          name,
          categoryId,
          serialNumber: row["Serial Number"] ?? null,
          purchaseDate: row["Purchase Date"] ?? null,
          purchaseCost: row["Purchase Cost"] ? parseFloat(row["Purchase Cost"]) : null,
          condition: row["Condition"] ?? null,
          notes: row["Notes"] ?? null,
          status: "available",
        });
        results.push({ row: i + 1, status: "created", assetCode: code });
        created++;
      } catch (rowErr) {
        results.push({ row: i + 1, status: "error", error: String(rowErr) });
        errors++;
      }
    }

    // BI-11: Log the import
    const logId = crypto.randomUUID();
    await db.insert(importLogsTable).values({
      id: logId, importType: "assets", totalRows: rows.length,
      successCount: created, errorCount: errors,
      errors: results.filter((r) => r.status === "error").map((r) => ({ row: r.row, error: r.error! })),
      importedBy: req.user?.id ?? null,
    });

    res.json({ created, errors, results });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE EQUIPMENT (self-declared workstation items)
// ─────────────────────────────────────────────────────────────────────────────

const EQUIPMENT_TYPES = [
  "laptop", "desktop", "cpu", "monitor", "mouse", "keyboard",
  "headset", "webcam", "printer", "tablet", "phone", "other",
];

/** List equipment for an employee.
 *  - Privileged (HR/admin): can view any employee by :employeeId
 *  - Employee: can only view their own (resolved from auth)
 */
router.get("/employees/:employeeId/equipment", requireAuth, async (req, res) => {
  try {
    const targetId = req.params.employeeId as string;

    // Non-privileged employees can only read their own
    if (!isPrivileged(req)) {
      const [self] = await db.select({ id: employeesTable.id })
        .from(employeesTable).where(eq(employeesTable.userId, req.user!.id));
      if (!self || self.id !== targetId) {
        res.status(403).json({ error: "Access denied" }); return;
      }
    }

    const items = await db.select()
      .from(employeeEquipmentTable)
      .where(eq(employeeEquipmentTable.employeeId, targetId))
      .orderBy(employeeEquipmentTable.createdAt);

    res.json(items);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Add an equipment item.
 *  - Employee: can only add to their own profile
 *  - HR/admin: can add to any employee
 */
router.post("/employees/:employeeId/equipment", requireAuth, async (req, res) => {
  try {
    const targetId = req.params.employeeId as string;

    // Non-privileged employees can only write their own
    if (!isPrivileged(req)) {
      const [self] = await db.select({ id: employeesTable.id })
        .from(employeesTable).where(eq(employeesTable.userId, req.user!.id));
      if (!self || self.id !== targetId) {
        res.status(403).json({ error: "Access denied" }); return;
      }
    }

    const { equipmentType, customDescription, notes } = req.body as {
      equipmentType?: string; customDescription?: string; notes?: string;
    };

    if (!equipmentType || !EQUIPMENT_TYPES.includes(equipmentType)) {
      res.status(400).json({ error: "Invalid equipment type" }); return;
    }
    if (equipmentType === "other" && !customDescription?.trim()) {
      res.status(400).json({ error: "Description is required for 'Other' equipment" }); return;
    }

    // Verify employee exists
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, targetId));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    const id = crypto.randomUUID();
    await db.insert(employeeEquipmentTable).values({
      id, employeeId: targetId, equipmentType,
      customDescription: customDescription?.trim() || null,
      notes: notes?.trim() || null,
    });

    const [created] = await db.select().from(employeeEquipmentTable)
      .where(eq(employeeEquipmentTable.id, id));
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Delete an equipment item.
 *  - Employee: can only delete their own items
 *  - HR/admin: can delete any
 */
router.delete("/employees/:employeeId/equipment/:itemId", requireAuth, async (req, res) => {
  try {
    const { employeeId: targetId, itemId } = req.params as { employeeId: string; itemId: string };

    if (!isPrivileged(req)) {
      const [self] = await db.select({ id: employeesTable.id })
        .from(employeesTable).where(eq(employeesTable.userId, req.user!.id));
      if (!self || self.id !== targetId) {
        res.status(403).json({ error: "Access denied" }); return;
      }
    }

    await db.delete(employeeEquipmentTable)
      .where(and(eq(employeeEquipmentTable.id, itemId), eq(employeeEquipmentTable.employeeId, targetId)));

    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
