import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  kraTemplatesTable,
  reviewCyclesTable,
  kraAssignmentsTable,
  employeesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { fireAutomationEvent } from "../lib/automations";

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
    const [tmpl] = await db.insert(kraTemplatesTable).values(req.body).returning();
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
    const [cycle] = await db.insert(reviewCyclesTable).values(req.body).returning();
    res.status(201).json(cycle);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/review-cycles/:id/close", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const [cycle] = await db
      .update(reviewCyclesTable)
      .set({ status: "closed" })
      .where(eq(reviewCyclesTable.id, req.params.id))
      .returning();
    if (!cycle) { res.status(404).json({ error: "Not found" }); return; }
    res.json(cycle);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/kra/assignments", requireAuth, async (req, res) => {
  try {
    const { employeeId, cycleId } = req.query as Record<string, string>;
    let assignments = await db.select().from(kraAssignmentsTable);
    if (employeeId) assignments = assignments.filter((a) => a.employeeId === employeeId);
    if (cycleId) assignments = assignments.filter((a) => a.cycleId === cycleId);
    const enriched = await Promise.all(assignments.map(enrichAssignment));
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/assignments", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res) => {
  try {
    const [assignment] = await db.insert(kraAssignmentsTable).values(req.body).returning();
    const enriched = await enrichAssignment(assignment);

    fireAutomationEvent({ event: "kra.assigned", employeeId: assignment.employeeId }).catch(console.error);

    res.status(201).json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/assignments/:id/self-assess", requireAuth, async (req, res) => {
  try {
    const { selfRating, selfComment } = req.body as { selfRating: number; selfComment?: string };
    const [assignment] = await db
      .update(kraAssignmentsTable)
      .set({ selfRating, selfComment, status: "self_assessed" })
      .where(eq(kraAssignmentsTable.id, req.params.id))
      .returning();
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
    const [existing] = await db.select().from(kraAssignmentsTable).where(eq(kraAssignmentsTable.id, req.params.id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    const weightedScore = (managerRating * existing.weightage) / 100;
    const [assignment] = await db
      .update(kraAssignmentsTable)
      .set({ managerRating, managerComment, weightedScore, status: "completed" })
      .where(eq(kraAssignmentsTable.id, req.params.id))
      .returning();

    fireAutomationEvent({ event: "kra.completed", employeeId: existing.employeeId }).catch(console.error);

    res.json(await enrichAssignment(assignment));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
