import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  kraTemplatesTable,
  reviewCyclesTable,
  kraAssignmentsTable,
  employeesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

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

router.get("/kra/templates", async (_req, res) => {
  try {
    const templates = await db.select().from(kraTemplatesTable);
    res.json(templates);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/templates", async (req, res) => {
  try {
    const [tmpl] = await db.insert(kraTemplatesTable).values(req.body).returning();
    res.status(201).json(tmpl);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/kra/review-cycles", async (_req, res) => {
  try {
    const cycles = await db.select().from(reviewCyclesTable);
    res.json(cycles);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/review-cycles", async (req, res) => {
  try {
    const [cycle] = await db.insert(reviewCyclesTable).values(req.body).returning();
    res.status(201).json(cycle);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/review-cycles/:id/close", async (req, res) => {
  try {
    const [cycle] = await db
      .update(reviewCyclesTable)
      .set({ status: "closed" })
      .where(eq(reviewCyclesTable.id, req.params.id))
      .returning();
    if (!cycle) return res.status(404).json({ error: "Not found" });
    res.json(cycle);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/kra/assignments", async (req, res) => {
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

router.post("/kra/assignments", async (req, res) => {
  try {
    const [assignment] = await db.insert(kraAssignmentsTable).values(req.body).returning();
    res.status(201).json(await enrichAssignment(assignment));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/assignments/:id/self-assess", async (req, res) => {
  try {
    const { selfRating, selfComment } = req.body;
    const [assignment] = await db
      .update(kraAssignmentsTable)
      .set({ selfRating, selfComment, status: "self_assessed" })
      .where(eq(kraAssignmentsTable.id, req.params.id))
      .returning();
    if (!assignment) return res.status(404).json({ error: "Not found" });
    res.json(await enrichAssignment(assignment));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/kra/assignments/:id/manager-rate", async (req, res) => {
  try {
    const { managerRating, managerComment } = req.body;
    const [existing] = await db.select().from(kraAssignmentsTable).where(eq(kraAssignmentsTable.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const weightedScore = (managerRating * existing.weightage) / 100;
    const [assignment] = await db
      .update(kraAssignmentsTable)
      .set({ managerRating, managerComment, weightedScore, status: "completed" })
      .where(eq(kraAssignmentsTable.id, req.params.id))
      .returning();
    res.json(await enrichAssignment(assignment));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
