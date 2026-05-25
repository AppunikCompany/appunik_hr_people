import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  leaveTypesTable,
  leaveBalancesTable,
  leaveRequestsTable,
  compoffsTable,
  leavePoliciesTable,
  employeesTable,
  holidaysTable,
} from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { fireAutomationEvent } from "../lib/automations";
import { resolveEmployeeId, isPrivileged } from "../lib/ownership";

const router: IRouter = Router();

function countBusinessDays(start: Date, end: Date, holidayDates: Set<string> = new Set()): number {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cur <= endDay) {
    const dow = cur.getDay();
    const dateStr = cur.toISOString().split("T")[0];
    if (dow !== 0 && dow !== 6 && !holidayDates.has(dateStr)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

async function fetchHolidayDates(startDate: string, endDate: string): Promise<Set<string>> {
  const holidays = await db.select({ date: holidaysTable.date }).from(holidaysTable)
    .where(and(gte(holidaysTable.date, startDate), lte(holidaysTable.date, endDate)));
  return new Set(holidays.map((h) => h.date));
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
    const { employeeId: queryEmployeeId } = req.query as Record<string, string>;
    const year = new Date().getFullYear();
    const role = req.user?.role ?? "employee";

    // Resolve the effective employee ID filter based on role
    let effectiveEmployeeId: string | null = null;
    if (role === "employee") {
      // Always force employees to see only their own balance
      const [emp] = await db.select({ id: employeesTable.id })
        .from(employeesTable).where(eq(employeesTable.userId, req.user!.id));
      effectiveEmployeeId = emp?.id ?? null;
      if (!effectiveEmployeeId) { res.json([]); return; }
    } else if (role === "manager") {
      // Managers may request a specific employee's balance (own team); fall back to all if not specified
      effectiveEmployeeId = queryEmployeeId ?? null;
    } else {
      // hr_admin / super_admin / it_admin — honour the query param or return all
      effectiveEmployeeId = queryEmployeeId ?? null;
    }

    let balances = await db
      .select({
        balance: leaveBalancesTable,
        leaveType: leaveTypesTable,
      })
      .from(leaveBalancesTable)
      .leftJoin(leaveTypesTable, eq(leaveBalancesTable.leaveTypeId, leaveTypesTable.id));

    if (effectiveEmployeeId) balances = balances.filter((b) => b.balance.employeeId === effectiveEmployeeId);

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

// ── Bulk-allocate leave balances for all active employees ─────────────────────
// Creates balance rows (year's entitlement from maxDaysPerYear) for every
// active employee × active leave type combination that doesn't already exist.
// Safe to run multiple times — skips existing records.
router.post("/leave/balances/allocate-bulk", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const year = parseInt((req.body as any).year) || new Date().getFullYear();

    const [employees, leaveTypes, existingBalances] = await Promise.all([
      db.select({ id: employeesTable.id, firstName: employeesTable.firstName, lastName: employeesTable.lastName })
        .from(employeesTable).where(eq(employeesTable.status, "active")),
      db.select().from(leaveTypesTable).where(eq(leaveTypesTable.isActive, true)),
      db.select({ employeeId: leaveBalancesTable.employeeId, leaveTypeId: leaveBalancesTable.leaveTypeId })
        .from(leaveBalancesTable).where(eq(leaveBalancesTable.year, year)),
    ]);

    // Build a set of already-existing (employeeId, leaveTypeId) pairs
    const existingSet = new Set(existingBalances.map((b) => `${b.employeeId}::${b.leaveTypeId}`));

    const toInsert: Array<{ id: string; employeeId: string; leaveTypeId: string; balance: number; used: number; year: number }> = [];
    for (const emp of employees) {
      for (const lt of leaveTypes) {
        if (!existingSet.has(`${emp.id}::${lt.id}`)) {
          toInsert.push({
            id: crypto.randomUUID(),
            employeeId: emp.id,
            leaveTypeId: lt.id,
            balance: lt.maxDaysPerYear,
            used: 0,
            year,
          });
        }
      }
    }

    if (toInsert.length > 0) {
      // Insert in batches of 50
      for (let i = 0; i < toInsert.length; i += 50) {
        await db.insert(leaveBalancesTable).values(toInsert.slice(i, i + 50));
      }
    }

    res.json({
      allocated: toInsert.length,
      skipped: existingBalances.length,
      employees: employees.length,
      leaveTypes: leaveTypes.length,
      year,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Create / upsert a single employee's balance for a leave type ──────────────
router.post("/leave/balances", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { employeeId, leaveTypeId, balance, used = 0, year } = req.body as {
      employeeId: string; leaveTypeId: string; balance: number; used?: number; year?: number;
    };
    if (!employeeId || !leaveTypeId || balance === undefined) {
      res.status(400).json({ error: "employeeId, leaveTypeId, and balance are required" }); return;
    }
    const resolvedYear = year ?? new Date().getFullYear();

    const [existing] = await db.select().from(leaveBalancesTable)
      .where(and(
        eq(leaveBalancesTable.employeeId, employeeId),
        eq(leaveBalancesTable.leaveTypeId, leaveTypeId),
        eq(leaveBalancesTable.year, resolvedYear),
      ));

    if (existing) {
      // Update existing record
      await db.update(leaveBalancesTable)
        .set({ balance: Number(balance), used: Number(used) })
        .where(eq(leaveBalancesTable.id, existing.id));
      const [updated] = await db.select().from(leaveBalancesTable).where(eq(leaveBalancesTable.id, existing.id));
      res.json(updated);
    } else {
      const newId = crypto.randomUUID();
      await db.insert(leaveBalancesTable).values({
        id: newId, employeeId, leaveTypeId,
        balance: Number(balance), used: Number(used), year: resolvedYear,
      });
      const [created] = await db.select().from(leaveBalancesTable).where(eq(leaveBalancesTable.id, newId));
      res.status(201).json(created);
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Adjust an individual balance record (HR migration / manual tweak) ─────────
router.patch("/leave/balances/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const { balance, used } = req.body as { balance?: number; used?: number };
    const updateData: Record<string, any> = {};
    if (balance !== undefined) updateData.balance = Number(balance);
    if (used !== undefined) updateData.used = Number(used);
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "Provide balance and/or used to update" }); return;
    }
    const [existing] = await db.select().from(leaveBalancesTable).where(eq(leaveBalancesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Balance record not found" }); return; }
    await db.update(leaveBalancesTable).set(updateData).where(eq(leaveBalancesTable.id, id));
    const [updated] = await db.select().from(leaveBalancesTable).where(eq(leaveBalancesTable.id, id));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/leave/requests", requireAuth, async (req, res) => {
  try {
    const { employeeId, status, managerId } = req.query as Record<string, string>;
    const role = req.user?.role ?? "employee";

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

    if (role === "employee") {
      // Employees can only see their own leave requests — ignore all query params
      const [emp] = await db.select({ id: employeesTable.id })
        .from(employeesTable).where(eq(employeesTable.userId, req.user!.id));
      filtered = emp ? filtered.filter((r) => r.req.employeeId === emp.id) : [];
    } else if (role === "manager") {
      // Managers see their team's requests (direct reports)
      const [mgr] = await db.select({ id: employeesTable.id })
        .from(employeesTable).where(eq(employeesTable.userId, req.user!.id));
      if (mgr) {
        filtered = filtered.filter((r) => r.emp?.reportingManagerId === mgr.id);
      } else {
        filtered = [];
      }
      // Allow further filtering by employeeId or status within their team
      if (employeeId) filtered = filtered.filter((r) => r.req.employeeId === employeeId);
      if (status) filtered = filtered.filter((r) => r.req.status === status);
    } else {
      // hr_admin / super_admin / it_admin — see all, honour query filters
      if (employeeId) filtered = filtered.filter((r) => r.req.employeeId === employeeId);
      if (status) filtered = filtered.filter((r) => r.req.status === status);
      if (managerId) filtered = filtered.filter((r) => r.emp?.reportingManagerId === managerId);
    }

    const result = filtered.map((r) => ({
      ...r.req,
      employeeName: r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : "",
      leaveTypeName: r.lt?.name ?? "",
      approvedByName: null,
      isBackdated: r.req.isBackdated ?? false,
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

// ── Auto-convert overdue pending_doc leaves to LOP ──
export async function processOverduePendingDocLeaves(): Promise<void> {
  try {
    const now = new Date();
    const allPendingDoc = await db
      .select({ id: leaveRequestsTable.id, documentDeadlineAt: leaveRequestsTable.documentDeadlineAt })
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.status, "pending_doc"));

    const overdue = allPendingDoc.filter(
      (r) => r.documentDeadlineAt && new Date(r.documentDeadlineAt) < now
    );

    for (const r of overdue) {
      await db
        .update(leaveRequestsTable)
        .set({ status: "lop" })
        .where(eq(leaveRequestsTable.id, r.id));
    }
    if (overdue.length > 0) {
      console.log(`[leave] Auto-converted ${overdue.length} overdue pending_doc leave(s) to LOP`);
    }
  } catch (e) {
    console.error("[leave] Failed to process overdue pending_doc leaves:", e);
  }
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

    // ── Sick Leave Duration-Based Document Rules (from plan) ──
    const todayStr = new Date().toISOString().split("T")[0];
    const isBackdated = startDate < todayStr;
    let sickNeedsDoc = false;       // 3+ days: mandatory (can upload later)
    let documentDeadlineAt: Date | null = null;

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

    // ── Day count: half day = 0.5, otherwise count business days (excluding holidays) ──
    const holidayDates = isHalfDay ? new Set<string>() : await fetchHolidayDates(startDate, endDate);
    const days = isHalfDay ? 0.5 : countBusinessDays(new Date(startDate), new Date(endDate), holidayDates);

    // ── Sick leave: apply duration-based document rules ──
    if (isSickLeaveType(lt)) {
      const isAdvance = startDate > todayStr; // future-dated sick leave
      const deadlineDays = policy?.documentDeadlineDays ?? 3;

      if (isAdvance) {
        // Advance sick leave: document must be provided upfront — no grace period
        if (!medicalDocumentUrl?.trim()) {
          res.status(400).json({
            error: "Advance sick leave requires a supporting document (doctor's appointment letter, medical certificate, etc.)",
          });
          return;
        }
        // Doc provided — no pending_doc needed
      } else if (days >= 3) {
        // 3+ days (backdated or today): document is mandatory — allow submission without doc (pending_doc),
        // employee must upload within deadline or it converts to LOP
        sickNeedsDoc = !medicalDocumentUrl?.trim();
        if (sickNeedsDoc) {
          documentDeadlineAt = new Date();
          documentDeadlineAt.setDate(documentDeadlineAt.getDate() + deadlineDays);
        }
      }
      // ≤1 day (non-advance): no doc needed (trust-based)
      // 2 days (non-advance): optional — frontend shows soft warning, no backend block
    }

    // ── LV-05: Auto-detect LOP when balance is exhausted ──
    const year = new Date().getFullYear();
    const [bal] = await db.select().from(leaveBalancesTable)
      .where(and(eq(leaveBalancesTable.employeeId, employeeId), eq(leaveBalancesTable.leaveTypeId, leaveTypeId), eq(leaveBalancesTable.year, year)));
    const isLop = !!bal && (bal.balance - bal.used) < days;

    // Determine final status
    // pending_doc takes priority (employee must upload doc), then lop, then pending
    const effectiveStatus = sickNeedsDoc ? "pending_doc" : isLop ? "lop" : "pending";

    const lrId = crypto.randomUUID();
    await db.insert(leaveRequestsTable).values({
      id: lrId, employeeId, leaveTypeId, startDate, endDate, days,
      isHalfDay, halfDayPeriod: halfDayPeriod ?? null,
      isBackdated,
      medicalDocumentUrl: medicalDocumentUrl?.trim() || null,
      documentDeadlineAt,
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
      pendingDoc: sickNeedsDoc,
      documentDeadlineAt: documentDeadlineAt?.toISOString() ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/leave/requests/:id/approve", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res) => {
  try {
    const { comment, approvedByRole } = req.body as { comment?: string; approvedByRole?: string };
    const [existing] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (!["pending", "lop"].includes(existing.status)) {
      res.status(400).json({ error: "Only pending leave requests can be approved" }); return;
    }

    const approverId = req.user!.id;
    const approverRole = approvedByRole ?? req.user!.role ?? "manager";

    // LOP leaves stay as "lop" when approved — preserves LOP info for payroll and reports
    const approvedStatus = existing.status === "lop" ? "lop" : "approved";
    await db.update(leaveRequestsTable).set({
      status: approvedStatus,
      managerComment: comment,
      approvedById: approverId,
      approvedByRole: approverRole,
    }).where(eq(leaveRequestsTable.id, (req.params.id as string)));
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

    // Lookup approver name
    const [approver] = approverId ? await db.select().from(employeesTable).where(eq(employeesTable.userId, approverId)) : [null];
    res.json({
      ...request,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
      leaveTypeName: lt?.name ?? "",
      approvedByName: approver ? `${approver.firstName} ${approver.lastName}` : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/leave/requests/:id/reject", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res) => {
  try {
    const { comment, approvedByRole } = req.body as { comment?: string; approvedByRole?: string };
    const [existing] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (!["pending", "lop"].includes(existing.status)) {
      res.status(400).json({ error: "Only pending leave requests can be rejected" }); return;
    }
    const approverId = req.user!.id;
    const approverRole = approvedByRole ?? req.user!.role ?? "manager";
    await db.update(leaveRequestsTable).set({
      status: "rejected",
      managerComment: comment,
      approvedById: approverId,
      approvedByRole: approverRole,
    }).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    const [request] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, (req.params.id as string)));

    if (!request) { res.status(404).json({ error: "Not found" }); return; }

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, request.employeeId));
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, request.leaveTypeId));

    fireAutomationEvent({
      event: "leave.rejected",
      employeeId: request.employeeId,
      variables: { leaveType: lt?.name ?? "", startDate: request.startDate, endDate: request.endDate },
    }).catch(console.error);

    const [approver] = approverId ? await db.select().from(employeesTable).where(eq(employeesTable.userId, approverId)) : [null];
    res.json({
      ...request,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
      leaveTypeName: lt?.name ?? "",
      approvedByName: approver ? `${approver.firstName} ${approver.lastName}` : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Cancel a pending leave request ──
router.delete("/leave/requests/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const [existing] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (!["pending", "lop"].includes(existing.status)) {
      res.status(400).json({ error: "Only pending leave requests can be cancelled" }); return;
    }
    // Employees can only cancel their own; privileged roles can cancel any
    const userId = req.user!.id;
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.userId, userId));
    const isPrivileged = ["super_admin", "hr_admin", "it_admin", "manager"].includes(req.user!.role ?? "");
    if (!isPrivileged && emp?.id !== existing.employeeId) {
      res.status(403).json({ error: "Access denied" }); return;
    }
    await db.update(leaveRequestsTable).set({ status: "cancelled" }).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Edit a pending leave request ──
router.patch("/leave/requests/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const [existing] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (!["pending", "lop"].includes(existing.status)) {
      res.status(400).json({ error: "Only pending leave requests can be edited" }); return;
    }
    const userId = req.user!.id;
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.userId, userId));
    const isPrivileged = ["super_admin", "hr_admin", "it_admin", "manager"].includes(req.user!.role ?? "");
    if (!isPrivileged && emp?.id !== existing.employeeId) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const { startDate, endDate, reason, isHalfDay, halfDayPeriod } = req.body as {
      startDate?: string; endDate?: string; reason?: string; isHalfDay?: boolean; halfDayPeriod?: string;
    };
    const newStart = startDate ?? existing.startDate;
    const newEnd = endDate ?? existing.endDate;
    const newIsHalfDay = isHalfDay ?? existing.isHalfDay;
    const holidayDates = newIsHalfDay ? new Set<string>() : await fetchHolidayDates(newStart, newEnd);
    const days = newIsHalfDay ? 0.5 : countBusinessDays(new Date(newStart), new Date(newEnd), holidayDates);

    await db.update(leaveRequestsTable).set({
      startDate: newStart, endDate: newEnd, reason: reason ?? existing.reason,
      isHalfDay: newIsHalfDay, halfDayPeriod: halfDayPeriod ?? existing.halfDayPeriod, days,
    }).where(eq(leaveRequestsTable.id, (req.params.id as string)));

    const [updated] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Upload / update medical document on a pending_doc leave ──
router.patch("/leave/requests/:id/document", requireAuth, async (req, res): Promise<void> => {
  try {
    const { medicalDocumentUrl } = req.body as { medicalDocumentUrl: string };
    if (!medicalDocumentUrl?.trim()) {
      res.status(400).json({ error: "medicalDocumentUrl is required" }); return;
    }
    const [existing] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    // Only the owning employee or privileged roles can upload
    const userId = req.user!.id;
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.userId, userId));
    const priv = ["super_admin", "hr_admin", "it_admin", "manager"].includes(req.user!.role ?? "");
    if (!priv && emp?.id !== existing.employeeId) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    // Move from pending_doc → pending so manager can now approve
    const newStatus = existing.status === "pending_doc" ? "pending" : existing.status;
    await db.update(leaveRequestsTable).set({
      medicalDocumentUrl: medicalDocumentUrl.trim(),
      status: newStatus,
    }).where(eq(leaveRequestsTable.id, (req.params.id as string)));

    const [updated] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, (req.params.id as string)));
    res.json({ ...updated, statusChanged: newStatus !== existing.status });
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

// ── Admin: clear all leave request data (super_admin only) ──
router.delete("/leave/admin/clear-all", requireAuth, requireRole("super_admin"), async (_req, res): Promise<void> => {
  try {
    // Delete all leave requests
    await db.delete(leaveRequestsTable);
    // Reset all leave balances: used → 0, balance → allocated (balance + used)
    const allBalances = await db.select().from(leaveBalancesTable);
    for (const b of allBalances) {
      const allocated = b.balance + b.used;
      await db.update(leaveBalancesTable)
        .set({ used: 0, balance: allocated })
        .where(eq(leaveBalancesTable.id, b.id));
    }
    res.json({ ok: true, deletedRequests: true, balancesReset: allBalances.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
