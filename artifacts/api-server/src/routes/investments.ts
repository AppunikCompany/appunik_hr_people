import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { investmentDeclarationsTable, employeesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { resolveEmployeeId, isPrivileged } from "../lib/ownership";

const router: IRouter = Router();

// ── SS-09: Submit an investment declaration ──
router.post("/investment-declarations", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId: clientId, financialYear, section, category, declaredAmount, proofUrl, notes } = req.body as {
      employeeId?: string;
      financialYear: string;
      section: string;
      category: string;
      declaredAmount: number;
      proofUrl?: string;
      notes?: string;
    };

    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;

    const id = crypto.randomUUID();
    await db.insert(investmentDeclarationsTable).values({
      id,
      employeeId,
      financialYear,
      section,
      category,
      declaredAmount,
      proofUrl: proofUrl ?? null,
      notes: notes ?? null,
    });
    const [declaration] = await db.select().from(investmentDeclarationsTable).where(eq(investmentDeclarationsTable.id, id));
    res.status(201).json(declaration);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── List investment declarations ──
router.get("/investment-declarations", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const filterEmpId = req.query.employeeId as string | undefined;
    const financialYear = req.query.financialYear as string | undefined;

    if (isPrivileged(req)) {
      let rows = await db.select().from(investmentDeclarationsTable).orderBy(desc(investmentDeclarationsTable.createdAt));
      if (filterEmpId) rows = rows.filter((r) => r.employeeId === filterEmpId);
      if (financialYear) rows = rows.filter((r) => r.financialYear === financialYear);

      const employees = await db.select().from(employeesTable);
      const empMap = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
      const enriched = rows.map((r) => ({ ...r, employeeName: empMap.get(r.employeeId) ?? "" }));
      res.json(enriched);
    } else {
      const employeeId = await resolveEmployeeId(req, res);
      if (!employeeId) return;

      let rows = await db
        .select()
        .from(investmentDeclarationsTable)
        .where(eq(investmentDeclarationsTable.employeeId, employeeId))
        .orderBy(desc(investmentDeclarationsTable.createdAt));
      if (financialYear) rows = rows.filter((r) => r.financialYear === financialYear);
      res.json(rows);
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Update own draft/proof declaration ──
router.patch("/investment-declarations/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const [existing] = await db.select().from(investmentDeclarationsTable).where(eq(investmentDeclarationsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Declaration not found" }); return; }

    const employeeId = await resolveEmployeeId(req, res);
    if (!employeeId) return;
    if (existing.employeeId !== employeeId && !isPrivileged(req)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    if (!["declared", "proof_submitted"].includes(existing.status) && !isPrivileged(req)) {
      res.status(400).json({ error: "Only editable in declared/proof_submitted state" });
      return;
    }

    const { section, category, declaredAmount, proofUrl, notes, status } = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (section !== undefined) updates.section = section;
    if (category !== undefined) updates.category = category;
    if (declaredAmount !== undefined) updates.declaredAmount = declaredAmount;
    if (proofUrl !== undefined) updates.proofUrl = proofUrl;
    if (notes !== undefined) updates.notes = notes;
    // Status can only move forward: declared → proof_submitted. Never backward.
    if (status !== undefined) {
      const allowedTransitions: Record<string, string[]> = {
        declared: ["proof_submitted"],
        proof_submitted: [],
      };
      const currentStatus = existing.status;
      const allowed = allowedTransitions[currentStatus] ?? [];
      if (!allowed.includes(String(status))) {
        res.status(400).json({ error: `Cannot transition from '${currentStatus}' to '${status}'` });
        return;
      }
      updates.status = String(status);
    }

    await db.update(investmentDeclarationsTable).set(updates).where(eq(investmentDeclarationsTable.id, id));
    const [updated] = await db.select().from(investmentDeclarationsTable).where(eq(investmentDeclarationsTable.id, id));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Verify or reject a declaration ──
router.post("/investment-declarations/:id/review", requireAuth, requireRole("super_admin", "hr_admin"), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status, notes } = req.body as { status: "verified" | "rejected"; notes?: string };
    if (!["verified", "rejected"].includes(status)) {
      res.status(400).json({ error: "status must be 'verified' or 'rejected'" });
      return;
    }

    const [existing] = await db.select().from(investmentDeclarationsTable).where(eq(investmentDeclarationsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Declaration not found" }); return; }
    if (existing.status === "verified" || existing.status === "rejected") {
      res.status(400).json({ error: `Declaration has already been ${existing.status}` });
      return;
    }

    await db.update(investmentDeclarationsTable).set({
      status,
      notes: notes ?? existing.notes,
      verifiedById: req.user?.id ?? null,
      verifiedAt: new Date(),
    }).where(eq(investmentDeclarationsTable.id, id));

    const [updated] = await db.select().from(investmentDeclarationsTable).where(eq(investmentDeclarationsTable.id, id));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
