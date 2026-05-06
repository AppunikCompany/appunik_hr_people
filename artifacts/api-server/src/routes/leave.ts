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

function countBusinessDays(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cur <= endDay) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

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
    const { name, maxDaysPerYear, isPaid, isPaidLeave, isCarryForward, description, code } = req.body as Record<string, any>;
    if (!name || !name.trim()) { res.status(400).json({ error: "Leave type name is required" }); return; }
    if (maxDaysPerYear === undefined || maxDaysPerYear === null || maxDaysPerYear === "") {
      res.status(400).json({ error: "Max days per year is required" }); return;
    }
    // Auto-generate code from name if not provided
    const resolvedCode = code || name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const ltId = crypto.randomUUID();
    await db.insert(leaveTypesTable).values({
      id: ltId,
      name: name.trim(),
      code: resolvedCode,
      maxDaysPerYear: Number(maxDaysPerYear),
      isPaidLeave: isPaidLeave ?? isPaid ?? true,
      isCarryForward: isCarryForward ?? false,
    });
    const [type] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, ltId));
    res.status(201).json(type);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/leave/types/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const { name, maxDaysPerYear, isPaid, isPaidLeave, isCarryForward } = req.body as Record<string, any>;
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (maxDaysPerYear !== undefined) updateData.maxDaysPerYear = Number(maxDaysPerYear);
    if (isPaidLeave !== undefined) updateData.isPaidLeave = isPaidLeave;
    else if (isPaid !== undefined) updateData.isPaidLeave = isPaid;
    if (isCarryForward !== undefined) updateData.isCarryForward = isCarryForward;
    await db.update(leaveTypesTable).set(updateData).where(eq(leaveTypesTable.id, id));
    const [type] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, id));
    if (!type) { res.status(404).json({ error: "Leave type not found" }); return; }
    res.json(type);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/leave/types/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    await db.delete(leaveTypesTable).where(eq(leaveTypesTable.id, id));
    res.status(204).end();
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

function isSickLeaveType(lt: { name: string; code: string } | undefined): boolean {
  if (!lt) return false;
  const name = lt.name.toLowerCase();
  const code = lt.code.toLowerCase();
  return name.includes("sick") || code === "sl" || code === "sick" || code === "sick_leave";
}

router.post("/leave/requests", requireAuth, async (req, res): Promise<void> => {
  try {
    const {
      employeeId: clientId, leaveTypeId, startDate, endDate, reason,
      isHalfDay = false, halfDayPeriod, medicalDocumentUrl,
    } = req.body as {
      employeeId?: string;
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      reason: string;
      isHalfDay?: boolean;
      halfDayPeriod?: string;
      medicalDocumentUrl?: string;
    };
    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;

    if (!startDate || !endDate || !leaveTypeId || !reason) {
      res.status(400).json({ error: "leaveTypeId, startDate, endDate, and reason are required" });
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      res.status(400).json({ error: "startDate must be on or before endDate" });
      return;
    }

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, leaveTypeId));

    // ── Sick Leave Rules ──
    if (isSickLeaveType(lt)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const isAdvance = start > today;

      if (isAdvance && !medicalDocumentUrl?.trim()) {
        res.status(400).json({
          error: "Sick leave cannot be applied in advance without a medical document. Please attach a medical document (URL or reference) to proceed.",
          code: "SICK_LEAVE_ADVANCE_DOC_REQUIRED",
        });
        return;
      }
    }

    // ── LV-09: Enforce leave policy rules ──
    const [policy] = await db.select().from(leavePoliciesTable).where(eq(leavePoliciesTable.leaveTypeId, leaveTypeId));
    if (policy) {
      // No leave during probation
      if (policy.noLeaveInProbation && emp?.probationEndDate) {
        const probEnd = new Date(emp.probationEndDate);
        if (new Date() < probEnd) {
          res.status(400).json({ error: `${lt?.name ?? "This leave type"} cannot be taken during probation period` });
          return;
        }
      }
      // Minimum notice days
      if (policy.minNoticeDays && policy.minNoticeDays > 0) {
        const daysUntilStart = Math.ceil((new Date(startDate).getTime() - Date.now()) / 86400000);
        if (daysUntilStart < policy.minNoticeDays) {
          res.status(400).json({ error: `${lt?.name ?? "This leave type"} requires at least ${policy.minNoticeDays} days advance notice` });
          return;
        }
      }
      // Max consecutive days
      if (policy.maxConsecutiveDays) {
        const days = countBusinessDays(new Date(startDate), new Date(endDate));
        if (days > policy.maxConsecutiveDays) {
          res.status(400).json({ error: `${lt?.name ?? "This leave type"} allows max ${policy.maxConsecutiveDays} consecutive days` });
          return;
        }
      }
    }

    // ── Day count: half day = 0.5, otherwise count business days ──
    const days = isHalfDay ? 0.5 : countBusinessDays(new Date(startDate), new Date(endDate));

    // ── LV-05: Auto-detect LOP when balance is exhausted ──
    const year = new Date().getFullYear();
    const [bal] = await db.select().from(leaveBalancesTable)
      .where(and(eq(leaveBalancesTable.employeeId, employeeId), eq(leaveBalancesTable.leaveTypeId, leaveTypeId), eq(leaveBalancesTable.year, year)));
    const isLop = !!bal && (bal.balance - bal.used) < days;
    const effectiveStatus = isLop ? "lop" : "pending";

    const lrId = crypto.randomUUID();
    await db.insert(leaveRequestsTable).values({
      id: lrId, employeeId, leaveTypeId, startDate, endDate, days,
      isHalfDay, halfDayPeriod: halfDayPeriod ?? null,
      medicalDocumentUrl: medicalDocumentUrl?.trim() || null,
      reason, status: effectiveStatus,
    });
    const [request] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, lrId));

    fireAutomationEvent({
      event: "leave.applied",
      employeeId,
      variables: { leaveType: lt?.name ?? "", startDate, endDate, days: String(days), reason, isLop: String(isLop) },
    }).catch(console.error);

    res.status(201).json({
      ...request,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
      leaveTypeName: lt?.name ?? "",
      approvedByName: null,
      isLop,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/leave/requests/:id/approve", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res) => {
  try {
    const { comment } = req.body as { comment?: string };
    const [existing] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    // LOP leaves stay as "lop" when approved — preserves LOP info for payroll and reports
    const approvedStatus = existing.status === "lop" ? "lop" : "approved";
    await db.update(leaveRequestsTable).set({ status: approvedStatus, managerComment: comment }).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    const [request] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, (req.params.id as string)));

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
    await db.update(leaveRequestsTable).set({ status: "rejected", managerComment: comment }).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    const [request] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, (req.params.id as string)));

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
    const coId = crypto.randomUUID();
    await db.insert(compoffsTable).values({ ...req.body, id: coId });
    const [compoff] = await db.select().from(compoffsTable).where(eq(compoffsTable.id, coId));
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

// ── BI-04: Leave data bulk export as CSV ──
router.get("/leave/export", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));
    const employees = await db.select().from(employeesTable);
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const types = await db.select().from(leaveTypesTable);
    const typeMap = new Map(types.map((t) => [t.id, t.name]));

    const balances = await db.select().from(leaveBalancesTable);
    const yearBalances = balances.filter((b) => b.year === year);

    const headers = ["Employee Code", "Name", "Leave Type", "Allocated", "Used", "Balance"];
    const rows = yearBalances.map((b) => {
      const emp = empMap.get(b.employeeId);
      return [
        emp?.employeeCode ?? "",
        emp ? `${emp.firstName} ${emp.lastName}` : "",
        typeMap.get(b.leaveTypeId) ?? "",
        b.balance + b.used,
        b.used,
        b.balance,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    });

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=leave_balances_${year}.csv`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
