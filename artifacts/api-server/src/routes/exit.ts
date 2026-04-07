import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { exitRequestsTable, exitChecklistItemsTable, employeesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { fireAutomationEvent } from "../lib/automations";

const router: IRouter = Router();

const DEFAULT_CHECKLIST = [
  { task: "Collect resignation letter", assignedTo: "hr" },
  { task: "Conduct exit interview", assignedTo: "hr" },
  { task: "Update employee status to resigned", assignedTo: "hr" },
  { task: "Process Full & Final settlement", assignedTo: "hr" },
  { task: "Cancel health/group insurance", assignedTo: "hr" },
  { task: "Revoke email and system access", assignedTo: "it" },
  { task: "Collect laptop and accessories", assignedTo: "it" },
  { task: "Revoke VPN and tool access", assignedTo: "it" },
  { task: "Delete/archive employee data per policy", assignedTo: "it" },
  { task: "Complete knowledge transfer", assignedTo: "manager" },
  { task: "Handover ongoing projects and documentation", assignedTo: "manager" },
  { task: "Return ID card and access badge", assignedTo: "employee" },
  { task: "Return company assets (if any)", assignedTo: "employee" },
  { task: "Submit pending expense claims", assignedTo: "employee" },
  { task: "Recover salary advance/loans (if any)", assignedTo: "finance" },
  { task: "Issue Form 16 / tax documents", assignedTo: "finance" },
];

async function enrichRequest(req: any, employees: any[]) {
  const emp = employees.find(e => e.id === req.employeeId);
  const items = await db.select().from(exitChecklistItemsTable).where(eq(exitChecklistItemsTable.exitRequestId, req.id));
  const completed = items.filter(i => i.isCompleted).length;
  return { ...req, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "", employeeCode: emp?.employeeCode ?? "", checklistTotal: items.length, checklistDone: completed };
}

router.get("/exit/requests", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (_req, res) => {
  try {
    const requests = await db.select().from(exitRequestsTable).orderBy(desc(exitRequestsTable.createdAt));
    const employees = await db.select().from(employeesTable);
    const result = await Promise.all(requests.map(r => enrichRequest(r, employees)));
    res.json(result);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post("/exit/requests", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { employeeId, resignationDate, lastWorkingDay, reason } = req.body as { employeeId: string; resignationDate: string; lastWorkingDay: string; reason?: string };
    const id = crypto.randomUUID();
    await db.insert(exitRequestsTable).values({ id, employeeId, resignationDate, lastWorkingDay, reason: reason ?? null });

    // Create default checklist
    for (const item of DEFAULT_CHECKLIST) {
      await db.insert(exitChecklistItemsTable).values({ id: crypto.randomUUID(), exitRequestId: id, ...item });
    }

    // Update employee record
    await db.update(employeesTable).set({ resignationDate, lastWorkingDay, status: "resigned" }).where(eq(employeesTable.id, employeeId));

    const [exitReq] = await db.select().from(exitRequestsTable).where(eq(exitRequestsTable.id, id));
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));

    fireAutomationEvent({ event: "employee.offboarding_started", employeeId, variables: { lastWorkingDay } }).catch(console.error);

    res.status(201).json({ ...exitReq, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "", checklistTotal: DEFAULT_CHECKLIST.length, checklistDone: 0 });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.patch("/exit/requests/:id", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res) => {
  try {
    await db.update(exitRequestsTable).set(req.body).where(eq(exitRequestsTable.id, req.params.id as string));
    const [exitReq] = await db.select().from(exitRequestsTable).where(eq(exitRequestsTable.id, req.params.id as string));
    if (!exitReq) { res.status(404).json({ error: "Not found" }); return; }
    const employees = await db.select().from(employeesTable);
    res.json(await enrichRequest(exitReq, employees));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get("/exit/checklist/:exitRequestId", requireAuth, async (req, res) => {
  try {
    const items = await db.select().from(exitChecklistItemsTable).where(eq(exitChecklistItemsTable.exitRequestId, req.params.exitRequestId as string));
    res.json(items);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.patch("/exit/checklist/:itemId", requireAuth, async (req, res) => {
  try {
    const { isCompleted, notes } = req.body as { isCompleted?: boolean; notes?: string };
    const updates: any = {};
    if (isCompleted !== undefined) { updates.isCompleted = isCompleted; updates.completedAt = isCompleted ? new Date() : null; }
    if (notes !== undefined) updates.notes = notes;
    await db.update(exitChecklistItemsTable).set(updates).where(eq(exitChecklistItemsTable.id, req.params.itemId as string));
    const [item] = await db.select().from(exitChecklistItemsTable).where(eq(exitChecklistItemsTable.id, req.params.itemId as string));
    res.json(item);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
