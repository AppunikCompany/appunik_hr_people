import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { reimbursementsTable, employeesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { resolveEmployeeId, isPrivileged } from "../lib/ownership";

const router: IRouter = Router();

// ── SS-06: Submit a reimbursement claim ──
router.post("/reimbursements", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId: clientId, category, amount, description, receiptUrl, expenseDate } = req.body as {
      employeeId?: string;
      category: string;
      amount: number;
      description?: string;
      receiptUrl?: string;
      expenseDate: string;
    };

    if (!category || !expenseDate) {
      res.status(400).json({ error: "category and expenseDate are required" });
      return;
    }
    if (typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }
    if (amount > 500000) {
      res.status(400).json({ error: "amount cannot exceed 500,000" });
      return;
    }

    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;

    const id = crypto.randomUUID();
    await db.insert(reimbursementsTable).values({
      id,
      employeeId,
      category,
      amount,
      description: description ?? null,
      receiptUrl: receiptUrl ?? null,
      expenseDate,
    });
    const [claim] = await db.select().from(reimbursementsTable).where(eq(reimbursementsTable.id, id));
    res.status(201).json(claim);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── List reimbursement claims ──
// Employees see only their own; privileged roles see all (optionally filtered by employeeId)
router.get("/reimbursements", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const filterEmpId = req.query.employeeId as string | undefined;

    if (isPrivileged(req)) {
      let claims = await db.select().from(reimbursementsTable).orderBy(desc(reimbursementsTable.createdAt));
      if (filterEmpId) claims = claims.filter((c) => c.employeeId === filterEmpId);

      // Enrich with employee name
      const employees = await db.select().from(employeesTable);
      const empMap = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
      const enriched = claims.map((c) => ({ ...c, employeeName: empMap.get(c.employeeId) ?? "" }));
      res.json(enriched);
    } else {
      const employeeId = await resolveEmployeeId(req, res);
      if (!employeeId) return;
      const claims = await db
        .select()
        .from(reimbursementsTable)
        .where(eq(reimbursementsTable.employeeId, employeeId))
        .orderBy(desc(reimbursementsTable.createdAt));
      res.json(claims);
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Approve / reject a reimbursement claim ──
router.post("/reimbursements/:id/review", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req: Request, res: Response): Promise<void> => {
  try {
    const claimId = req.params.id as string;
    const { status, comment } = req.body as { status: "approved" | "rejected"; comment?: string };

    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
      return;
    }

    const [existing] = await db.select().from(reimbursementsTable).where(eq(reimbursementsTable.id, claimId));
    if (!existing) { res.status(404).json({ error: "Claim not found" }); return; }
    if (existing.status !== "pending") { res.status(400).json({ error: "Claim is not pending" }); return; }

    await db.update(reimbursementsTable).set({
      status,
      reviewedById: req.user?.id ?? null,
      reviewedAt: new Date(),
      reviewComment: comment ?? null,
    }).where(eq(reimbursementsTable.id, claimId));

    const [updated] = await db.select().from(reimbursementsTable).where(eq(reimbursementsTable.id, claimId));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Mark as paid ──
router.post("/reimbursements/:id/mark-paid", requireAuth, requireRole("super_admin", "hr_admin"), async (req: Request, res: Response): Promise<void> => {
  try {
    const claimId = req.params.id as string;
    const [existing] = await db.select().from(reimbursementsTable).where(eq(reimbursementsTable.id, claimId));
    if (!existing) { res.status(404).json({ error: "Claim not found" }); return; }
    if (existing.status !== "approved") { res.status(400).json({ error: "Only approved claims can be marked paid" }); return; }

    await db.update(reimbursementsTable).set({ status: "paid" }).where(eq(reimbursementsTable.id, claimId));
    const [updated] = await db.select().from(reimbursementsTable).where(eq(reimbursementsTable.id, claimId));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
