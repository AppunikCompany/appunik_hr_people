import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  kraTemplatesTable,
  reviewCyclesTable,
  kraAssignmentsTable,
  employeesTable,
  importLogsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { fireAutomationEvent } from "../lib/automations";
import { notifyEmployee } from "../lib/notify";
import { PRIVILEGED_ROLES, resolveEmployeeId } from "../lib/ownership";

const router: IRouter = Router();

async function enrichAssignment(a: typeof kraAssignmentsTable.$inferSelect) {
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, a.employeeId));
  const [cycle] = await db.select().from(reviewCyclesTable).where(eq(reviewCyclesTable.id, a.cycleId));
  return {
    ...a,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
    cycleName: cycle?.name ?? "",
  };
}

router.get("/kra/templates", requireAuth, async (_req, res) => {
  try {
    const templates = await db.select().from(kraTemplatesTable);
    res.json(templates);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/templates", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const tmplId = crypto.randomUUID();
    await db.insert(kraTemplatesTable).values({ ...req.body, id: tmplId });
    const [tmpl] = await db.select().from(kraTemplatesTable).where(eq(kraTemplatesTable.id, tmplId));
    res.status(201).json(tmpl);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/kra/review-cycles", requireAuth, async (_req, res) => {
  try {
    const cycles = await db.select().from(reviewCyclesTable);
    res.json(cycles);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/review-cycles", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { name, startDate, endDate } = req.body as { name?: string; startDate?: string; endDate?: string };
    if (!name || !name.trim()) { res.status(400).json({ error: "Review cycle name is required" }); return; }
    if (!startDate) { res.status(400).json({ error: "Start date is required" }); return; }
    if (!endDate) { res.status(400).json({ error: "End date is required" }); return; }
    const cycleId = crypto.randomUUID();
    await db.insert(reviewCyclesTable).values({ ...req.body, name: name.trim(), id: cycleId });
    const [cycle] = await db.select().from(reviewCyclesTable).where(eq(reviewCyclesTable.id, cycleId));
    res.status(201).json(cycle);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/review-cycles/:id/close", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.update(reviewCyclesTable).set({ status: "closed" }).where(eq(reviewCyclesTable.id, (req.params.id as string)));
    const [cycle] = await db.select().from(reviewCyclesTable).where(eq(reviewCyclesTable.id, (req.params.id as string)));
    if (!cycle) { res.status(404).json({ error: "Not found" }); return; }
    res.json(cycle);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/kra/assignments", requireAuth, async (req, res): Promise<void> => {
  try {
    const { employeeId: clientId, cycleId } = req.query as Record<string, string>;
    const user = req.user;

    let assignments = await db.select().from(kraAssignmentsTable);

    if (!PRIVILEGED_ROLES.has(user?.role ?? "")) {
      // Employees can only see their own assignments
      const [self] = await db.select().from(employeesTable).where(eq(employeesTable.userId, user?.id ?? ""));
      if (!self) { res.status(403).json({ error: "No employee record linked to your account" }); return; }
      assignments = assignments.filter((a) => a.employeeId === self.id);
    } else if (clientId) {
      assignments = assignments.filter((a) => a.employeeId === clientId);
    }

    if (cycleId) assignments = assignments.filter((a) => a.cycleId === cycleId);
    const enriched = await Promise.all(assignments.map(enrichAssignment));
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/assignments", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res) => {
  try {
    const { employeeId, cycleId, weightage } = req.body as { employeeId: string; cycleId: string; weightage: number };

    if (!employeeId || !cycleId) {
      res.status(400).json({ error: "employeeId and cycleId are required" });
      return;
    }
    if (typeof weightage !== "number" || weightage <= 0 || weightage > 100) {
      res.status(400).json({ error: "weightage must be between 1 and 100" });
      return;
    }

    const empCycleAssignments = await db
      .select({ weightage: kraAssignmentsTable.weightage })
      .from(kraAssignmentsTable)
      .where(and(eq(kraAssignmentsTable.employeeId, employeeId), eq(kraAssignmentsTable.cycleId, cycleId)));
    const usedWeightage = empCycleAssignments.reduce((sum, a) => sum + (a.weightage ?? 0), 0);
    if (usedWeightage + weightage > 100) {
      res.status(400).json({ error: `Total weightage would exceed 100%. Already used: ${usedWeightage}%, available: ${100 - usedWeightage}%` });
      return;
    }

    const kraId = crypto.randomUUID();
    await db.insert(kraAssignmentsTable).values({ ...req.body, id: kraId });
    const [assignment] = await db.select().from(kraAssignmentsTable).where(eq(kraAssignmentsTable.id, kraId));
    const enriched = await enrichAssignment(assignment);

    fireAutomationEvent({ event: "kra.assigned", employeeId: assignment.employeeId }).catch(console.error);
    notifyEmployee(assignment.employeeId, {
      type: "kra.assigned",
      title: "New KRA assigned",
      body: `You have been assigned "${enriched.kraTitle}" in the "${enriched.cycleName}" review cycle.`,
      link: "/performance",
    }).catch(console.error);

    res.status(201).json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/assignments/:id/self-assess", requireAuth, async (req, res) => {
  try {
    const { selfRating, selfComment } = req.body as { selfRating: number; selfComment?: string };
    await db.update(kraAssignmentsTable).set({ selfRating, selfComment, status: "self_assessed" }).where(eq(kraAssignmentsTable.id, (req.params.id as string)));
    const [assignment] = await db.select().from(kraAssignmentsTable).where(eq(kraAssignmentsTable.id, (req.params.id as string)));
    if (!assignment) { res.status(404).json({ error: "Not found" }); return; }

    fireAutomationEvent({ event: "kra.self_assessed", employeeId: assignment.employeeId }).catch(console.error);

    res.json(await enrichAssignment(assignment));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/assignments/:id/manager-rate", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res) => {
  try {
    const { managerRating, managerComment } = req.body as { managerRating: number; managerComment?: string };
    const [existing] = await db.select().from(kraAssignmentsTable).where(eq(kraAssignmentsTable.id, (req.params.id as string)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    const weightedScore = (managerRating * existing.weightage) / 100;
    await db.update(kraAssignmentsTable).set({ managerRating, managerComment, weightedScore, status: "completed" }).where(eq(kraAssignmentsTable.id, (req.params.id as string)));
    const [assignment] = await db.select().from(kraAssignmentsTable).where(eq(kraAssignmentsTable.id, (req.params.id as string)));

    fireAutomationEvent({ event: "kra.completed", employeeId: existing.employeeId }).catch(console.error);

    res.json(await enrichAssignment(assignment));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── BI-08: KRA bulk import ──
router.post("/kra/assignments/import", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res): Promise<void> => {
  try {
    const { rows } = req.body as { rows: Record<string, string>[] };
    if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "No rows provided" }); return; }

    const employees = await db.select().from(employeesTable);
    const empByCode = new Map(employees.map((e) => [e.employeeCode.toLowerCase(), e.id]));
    const cycles = await db.select().from(reviewCyclesTable);
    const cycleByName = new Map(cycles.map((c) => [c.name.toLowerCase(), c.id]));

    const results: Array<{ row: number; status: "created" | "error"; error?: string }> = [];
    let created = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const empCode = row["Employee Code"]?.trim();
        const cycleName = row["Review Cycle"]?.trim();
        const kraTitle = row["KRA Title"]?.trim();
        const weightage = parseFloat(row["Weightage"] ?? "0");

        if (!empCode || !cycleName || !kraTitle) {
          results.push({ row: i + 1, status: "error", error: "Employee Code, Review Cycle, and KRA Title are required" });
          errors++; continue;
        }

        const employeeId = empByCode.get(empCode.toLowerCase());
        if (!employeeId) { results.push({ row: i + 1, status: "error", error: `Employee "${empCode}" not found` }); errors++; continue; }

        const cycleId = cycleByName.get(cycleName.toLowerCase());
        if (!cycleId) { results.push({ row: i + 1, status: "error", error: `Review cycle "${cycleName}" not found` }); errors++; continue; }

        if (isNaN(weightage) || weightage <= 0 || weightage > 100) {
          results.push({ row: i + 1, status: "error", error: "Weightage must be between 1 and 100" }); errors++; continue;
        }

        const empCycleRows = await db
          .select({ weightage: kraAssignmentsTable.weightage })
          .from(kraAssignmentsTable)
          .where(and(eq(kraAssignmentsTable.employeeId, employeeId), eq(kraAssignmentsTable.cycleId, cycleId)));
        const usedWeightage = empCycleRows.reduce((sum, a) => sum + (a.weightage ?? 0), 0);
        if (usedWeightage + weightage > 100) {
          results.push({ row: i + 1, status: "error", error: `Total weightage would exceed 100% (used: ${usedWeightage}%)` }); errors++; continue;
        }

        const kraId = crypto.randomUUID();
        await db.insert(kraAssignmentsTable).values({
          id: kraId, employeeId, cycleId, kraTitle, weightage,
          target: row["Target"] ?? null, status: "pending",
        });
        results.push({ row: i + 1, status: "created" });
        created++;
      } catch (rowErr) {
        results.push({ row: i + 1, status: "error", error: String(rowErr) });
        errors++;
      }
    }

    // BI-11: Log the import
    const logId = crypto.randomUUID();
    await db.insert(importLogsTable).values({
      id: logId, importType: "kra", totalRows: rows.length,
      successCount: created, errorCount: errors,
      errors: results.filter((r) => r.status === "error").map((r) => ({ row: r.row, error: r.error! })),
      importedBy: req.user?.id ?? null,
    });

    res.json({ created, errors, results });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
