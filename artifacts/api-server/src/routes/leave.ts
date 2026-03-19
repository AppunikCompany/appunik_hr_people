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

const router: IRouter = Router();

router.get("/leave/types", async (_req, res) => {
  try {
    const types = await db.select().from(leaveTypesTable);
    res.json(types);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/leave/types", async (req, res) => {
  try {
    const [type] = await db.insert(leaveTypesTable).values(req.body).returning();
    res.status(201).json(type);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/leave/balances", async (req, res) => {
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

router.get("/leave/requests", async (req, res) => {
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

router.post("/leave/requests", async (req, res) => {
  try {
    const { employeeId, leaveTypeId, startDate, endDate, reason } = req.body;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

    const [request] = await db
      .insert(leaveRequestsTable)
      .values({ employeeId, leaveTypeId, startDate, endDate, days, reason })
      .returning();

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, leaveTypeId));

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

router.post("/leave/requests/:id/approve", async (req, res) => {
  try {
    const { comment } = req.body;
    const [request] = await db
      .update(leaveRequestsTable)
      .set({ status: "approved", managerComment: comment })
      .where(eq(leaveRequestsTable.id, req.params.id))
      .returning();

    if (!request) return res.status(404).json({ error: "Not found" });

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
      await db
        .update(leaveBalancesTable)
        .set({ used: bal.used + request.days, balance: Math.max(0, bal.balance - request.days) })
        .where(eq(leaveBalancesTable.id, bal.id));
    }

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

router.post("/leave/requests/:id/reject", async (req, res) => {
  try {
    const { comment } = req.body;
    const [request] = await db
      .update(leaveRequestsTable)
      .set({ status: "rejected", managerComment: comment })
      .where(eq(leaveRequestsTable.id, req.params.id))
      .returning();

    if (!request) return res.status(404).json({ error: "Not found" });

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, request.employeeId));
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, request.leaveTypeId));

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

router.get("/leave/compoff", async (req, res) => {
  try {
    const { employeeId } = req.query as Record<string, string>;
    let compoffs = await db.select().from(compoffsTable);
    if (employeeId) compoffs = compoffs.filter((c) => c.employeeId === employeeId);
    res.json(compoffs);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/leave/compoff", async (req, res) => {
  try {
    const [compoff] = await db.insert(compoffsTable).values(req.body).returning();
    res.status(201).json(compoff);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/leave/calendar", async (req, res) => {
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
