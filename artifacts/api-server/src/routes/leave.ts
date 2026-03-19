import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  leaveTypesTable,
  leaveBalancesTable,
  leaveRequestsTable,
  compoffsTable,
  leavePoliciesTable,
  employeesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { fireAutomationEvent } from "../lib/automations";
import { resolveEmployeeId } from "../lib/ownership";

const router: IRouter = Router();

router.get("/leave/types", requireAuth, async (_req, res) => {
  try {
    const types = await db.select().from(leaveTypesTable);
    res.json(types);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/leave/types", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const [type] = await db.insert(leaveTypesTable).values(req.body).returning();
    res.status(201).json(type);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/leave/balances", requireAuth, async (req, res) => {
  try {
    const { employeeId } = req.query as Record<string, string>;
    const year = new Date().getFullYear();

    let balances = await db
      .select({
        balance: leaveBalancesTable,
        leaveType: leaveTypesTable,
      })
      .from(leaveBalancesTable)
      .leftJoin(leaveTypesTable, eq(leaveBalancesTable.leaveTypeId, leaveTypesTable.id));

    if (employeeId) balances = balances.filter((b) => b.balance.employeeId === employeeId);

    const result = balances
      .filter((b) => b.balance.year === year)
      .map((b) => ({
        id: b.balance.id,
        employeeId: b.balance.employeeId,
        leaveTypeId: b.balance.leaveTypeId,
        leaveTypeName: b.leaveType?.name ?? "",
        leaveTypeCode: b.leaveType?.code ?? "",
        balance: b.balance.balance,
        used: b.balance.used,
        year: b.balance.year,
      }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/leave/requests", requireAuth, async (req, res) => {
  try {
    const { employeeId, status, managerId } = req.query as Record<string, string>;

    const requests = await db
      .select({
        req: leaveRequestsTable,
        emp: employeesTable,
        lt: leaveTypesTable,
      })
      .from(leaveRequestsTable)
      .leftJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
      .leftJoin(leaveTypesTable, eq(leaveRequestsTable.leaveTypeId, leaveTypesTable.id));

    let filtered = requests;
    if (employeeId) filtered = filtered.filter((r) => r.req.employeeId === employeeId);
    if (status) filtered = filtered.filter((r) => r.req.status === status);
    if (managerId) {
      filtered = filtered.filter((r) => r.emp?.reportingManagerId === managerId);
    }

    const result = filtered.map((r) => ({
      ...r.req,
      employeeName: r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : "",
      leaveTypeName: r.lt?.name ?? "",
      approvedByName: null,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/leave/requests", requireAuth, async (req, res): Promise<void> => {
  try {
    const { employeeId: clientId, leaveTypeId, startDate, endDate, reason } = req.body as {
      employeeId?: string;
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      reason: string;
    };
    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

    const [request] = await db
      .insert(leaveRequestsTable)
      .values({ employeeId, leaveTypeId, startDate, endDate, days, reason })
      .returning();

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, leaveTypeId));

    fireAutomationEvent({
      event: "leave.applied",
      employeeId,
      variables: { leaveType: lt?.name ?? "", startDate, endDate, days: String(days), reason },
    }).catch(console.error);

    res.status(201).json({
      ...request,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
      leaveTypeName: lt?.name ?? "",
      approvedByName: null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/leave/requests/:id/approve", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res) => {
  try {
    const { comment } = req.body as { comment?: string };
    const [request] = await db
      .update(leaveRequestsTable)
      .set({ status: "approved", managerComment: comment })
      .where(eq(leaveRequestsTable.id, (req.params.id as string)))
      .returning();

    if (!request) { res.status(404).json({ error: "Not found" }); return; }

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, request.employeeId));
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, request.leaveTypeId));

    const year = new Date().getFullYear();
    const [bal] = await db
      .select()
      .from(leaveBalancesTable)
      .where(
        and(
          eq(leaveBalancesTable.employeeId, request.employeeId),
          eq(leaveBalancesTable.leaveTypeId, request.leaveTypeId),
          eq(leaveBalancesTable.year, year)
        )
      );
    if (bal) {
      const newBalance = Math.max(0, bal.balance - request.days);
      await db
        .update(leaveBalancesTable)
        .set({ used: bal.used + request.days, balance: newBalance })
        .where(eq(leaveBalancesTable.id, bal.id));
      if (newBalance <= 2) {
        fireAutomationEvent({
          event: "leave.balance_low",
          employeeId: request.employeeId,
          variables: { leaveType: lt?.name ?? "", balance: String(newBalance) },
        }).catch(console.error);
      }
    }

    fireAutomationEvent({
      event: "leave.approved",
      employeeId: request.employeeId,
      variables: { leaveType: lt?.name ?? "", startDate: request.startDate, endDate: request.endDate, days: String(request.days) },
    }).catch(console.error);

    res.json({
      ...request,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
      leaveTypeName: lt?.name ?? "",
      approvedByName: null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/leave/requests/:id/reject", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res) => {
  try {
    const { comment } = req.body as { comment?: string };
    const [request] = await db
      .update(leaveRequestsTable)
      .set({ status: "rejected", managerComment: comment })
      .where(eq(leaveRequestsTable.id, (req.params.id as string)))
      .returning();

    if (!request) { res.status(404).json({ error: "Not found" }); return; }

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, request.employeeId));
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, request.leaveTypeId));

    fireAutomationEvent({
      event: "leave.rejected",
      employeeId: request.employeeId,
      variables: { leaveType: lt?.name ?? "", startDate: request.startDate, endDate: request.endDate },
    }).catch(console.error);

    res.json({
      ...request,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
      leaveTypeName: lt?.name ?? "",
      approvedByName: null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/leave/compoff", requireAuth, async (req, res) => {
  try {
    const { employeeId } = req.query as Record<string, string>;
    let compoffs = await db.select().from(compoffsTable);
    if (employeeId) compoffs = compoffs.filter((c) => c.employeeId === employeeId);
    res.json(compoffs);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/leave/compoff", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res) => {
  try {
    const [compoff] = await db.insert(compoffsTable).values(req.body).returning();
    res.status(201).json(compoff);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/leave/calendar", requireAuth, async (req, res) => {
  try {
    const { month, year } = req.query as Record<string, string>;
    const requests = await db
      .select({
        req: leaveRequestsTable,
        emp: employeesTable,
        lt: leaveTypesTable,
      })
      .from(leaveRequestsTable)
      .leftJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
      .leftJoin(leaveTypesTable, eq(leaveRequestsTable.leaveTypeId, leaveTypesTable.id));

    const m = parseInt(month);
    const y = parseInt(year);

    const result = requests
      .filter((r) => {
        const d = new Date(r.req.startDate);
        return d.getMonth() + 1 === m && d.getFullYear() === y;
      })
      .map((r) => ({
        employeeId: r.req.employeeId,
        employeeName: r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : "",
        leaveType: r.lt?.name ?? "",
        startDate: r.req.startDate,
        endDate: r.req.endDate,
        days: r.req.days,
        status: r.req.status,
      }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
