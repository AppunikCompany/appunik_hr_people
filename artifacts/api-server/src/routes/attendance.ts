import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  attendanceRecordsTable,
  attendanceBreaksTable,
  attendanceRegularizationsTable,
  overtimeLogsTable,
  holidaysTable,
  employeesTable,
  departmentsTable,
  appConfigTable,
  leaveRequestsTable,
} from "@workspace/db";
import { eq, and, inArray, lte, gte, isNull, desc, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { resolveEmployeeId, canReadEmployee, isPrivileged } from "../lib/ownership";
import { fireAutomationEvent } from "../lib/automations";
import { notifyEmployee } from "../lib/notify";

const router: IRouter = Router();

// ── Working-hours window: 8:00 AM – 10:00 PM (IST) ───────────────────────────
// Railway servers run in UTC — use Intl to get the correct local hour in IST.
const COMPANY_TIMEZONE = "Asia/Kolkata";
function isWithinWorkingHours(): boolean {
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: COMPANY_TIMEZONE, hour: "numeric", hour12: false }).format(new Date()),
    10,
  );
  return h >= 8 && h < 22;
}

router.post("/attendance/clock-in", requireAuth, async (req, res): Promise<void> => {
  try {
    if (!isWithinWorkingHours()) {
      res.status(400).json({ error: "Clock-in is only allowed between 8:00 AM and 10:00 PM" });
      return;
    }

    const { employeeId: clientId, notes } = req.body as { employeeId?: string; notes?: string };
    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;

    const today = new Date().toISOString().split("T")[0];
    const [existing] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));

    if (existing) {
      const msg = existing.clockOut
        ? "You've already completed your attendance for today. Use Regularization if you need a correction."
        : "Already clocked in today";
      res.status(400).json({ error: msg });
      return;
    }

    const recId = crypto.randomUUID();
    // Flexible hours — no concept of "late"; half-day determined at clock-out
    await db.insert(attendanceRecordsTable).values({
      id: recId, employeeId, date: today,
      clockIn: new Date(), type: "wfo",
      isLate: false, isHalfDay: false, notes,
    });
    const [record] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, recId));
    res.status(201).json(record);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/attendance/clock-out", requireAuth, async (req, res): Promise<void> => {
  try {
    if (!isWithinWorkingHours()) {
      res.status(400).json({ error: "Clock-out is only allowed between 8:00 AM and 10:00 PM" });
      return;
    }

    const { employeeId: clientId, notes } = req.body as { employeeId?: string; notes?: string };
    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;

    const today = new Date().toISOString().split("T")[0];
    const [existing] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));

    if (!existing) { res.status(404).json({ error: "No clock-in found for today" }); return; }
    if (existing.clockOut) { res.status(400).json({ error: "Already clocked out for today" }); return; }

    // Auto-close any open break before clocking out
    const [openBreak] = await db
      .select()
      .from(attendanceBreaksTable)
      .where(and(eq(attendanceBreaksTable.attendanceRecordId, existing.id), isNull(attendanceBreaksTable.breakEnd)));
    if (openBreak) {
      const autoEnd = new Date();
      const dur = (autoEnd.getTime() - new Date(openBreak.breakStart).getTime()) / 60000;
      await db.update(attendanceBreaksTable)
        .set({ breakEnd: autoEnd, durationMinutes: dur })
        .where(eq(attendanceBreaksTable.id, openBreak.id));
    }

    // Total break time for this record
    const allBreaks = await db.select().from(attendanceBreaksTable)
      .where(eq(attendanceBreaksTable.attendanceRecordId, existing.id));
    const totalBreakMs = allBreaks.reduce((sum, b) => {
      if (b.durationMinutes != null) return sum + b.durationMinutes * 60000;
      if (b.breakEnd) return sum + (new Date(b.breakEnd).getTime() - new Date(b.breakStart).getTime());
      return sum;
    }, 0);

    const clockOut = new Date();
    const rawMs = existing.clockIn
      ? clockOut.getTime() - new Date(existing.clockIn).getTime()
      : 0;
    const netMs = Math.max(0, rawMs - totalBreakMs);
    const hoursWorked = netMs / 3600000;
    const isHalfDay = hoursWorked < 4;

    await db.update(attendanceRecordsTable)
      .set({ clockOut, hoursWorked, isHalfDay, notes: notes ?? existing.notes })
      .where(eq(attendanceRecordsTable.id, existing.id));
    const [record] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, existing.id));
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/attendance/wfh", requireAuth, async (req, res): Promise<void> => {
  try {
    if (!isWithinWorkingHours()) {
      res.status(400).json({ error: "WFH can only be marked between 8:00 AM and 10:00 PM" });
      return;
    }

    const { employeeId: clientId, notes } = req.body as { employeeId?: string; notes?: string };
    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;

    const today = new Date().toISOString().split("T")[0];
    const existing = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));

    if (existing.length > 0) {
      res.status(400).json({ error: "Already marked attendance today" });
      return;
    }

    // AU-19: Check if WFH requires manager approval
    const [wfhCfg] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, "wfh_requires_approval"));
    const needsApproval = wfhCfg?.value === "true";

    const wfhId = crypto.randomUUID();
    const wfhType = needsApproval ? "wfh_pending" : "wfh";
    await db.insert(attendanceRecordsTable).values({ id: wfhId, employeeId, date: today, type: wfhType, isLate: false, isHalfDay: false, notes });
    const [record] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, wfhId));

    if (needsApproval) {
      // Notify manager
      const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
      if (emp?.reportingManagerId) {
        fireAutomationEvent({ event: "attendance.wfh_requested", employeeId, variables: { date: today } }).catch(console.error);
      }
    }

    res.status(201).json({ ...record, needsApproval });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/attendance/today", requireAuth, async (req, res): Promise<void> => {
  try {
    const clientId = req.query.employeeId as string | undefined;
    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;
    const today = new Date().toISOString().split("T")[0];
    const [record] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));

    if (!record) { res.json(null); return; }

    // Attach break state
    const breaks = await db
      .select()
      .from(attendanceBreaksTable)
      .where(and(eq(attendanceBreaksTable.attendanceRecordId, record.id)));

    const openBreak = breaks.find((b) => !b.breakEnd) ?? null;
    const totalBreakMinutes = breaks
      .filter((b) => b.durationMinutes != null)
      .reduce((sum, b) => sum + (b.durationMinutes ?? 0), 0);

    res.json({
      ...record,
      isOnBreak: !!openBreak,
      currentBreakStart: openBreak?.breakStart?.toISOString() ?? null,
      totalBreakMinutes,
      breakCount: breaks.length,
      breaks: breaks
        .sort((a, b) => new Date(a.breakStart).getTime() - new Date(b.breakStart).getTime())
        .map((b) => ({
          id: b.id,
          breakStart: b.breakStart?.toISOString() ?? null,
          breakEnd: b.breakEnd?.toISOString() ?? null,
          durationMinutes: b.durationMinutes ?? null,
        })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Break / Away tracking ─────────────────────────────────────────────────────

router.post("/attendance/break-start", requireAuth, async (req, res): Promise<void> => {
  try {
    const { employeeId: clientId } = req.body as { employeeId?: string };
    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;

    const today = new Date().toISOString().split("T")[0];

    // Must be clocked in today
    const [record] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));

    if (!record) { res.status(400).json({ error: "You must be clocked in before marking a break" }); return; }
    if (record.clockOut) { res.status(400).json({ error: "Cannot start a break after clocking out" }); return; }

    // Check no open break already
    const [openBreak] = await db
      .select()
      .from(attendanceBreaksTable)
      .where(and(eq(attendanceBreaksTable.attendanceRecordId, record.id), isNull(attendanceBreaksTable.breakEnd)));

    if (openBreak) { res.status(400).json({ error: "You already have an open break" }); return; }

    const breakId = crypto.randomUUID();
    await db.insert(attendanceBreaksTable).values({
      id: breakId,
      attendanceRecordId: record.id,
      employeeId,
      date: today,
      breakStart: new Date(),
    });

    const [created] = await db.select().from(attendanceBreaksTable).where(eq(attendanceBreaksTable.id, breakId));
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/attendance/break-end", requireAuth, async (req, res): Promise<void> => {
  try {
    const { employeeId: clientId } = req.body as { employeeId?: string };
    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;

    const today = new Date().toISOString().split("T")[0];

    const [record] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));

    if (!record) { res.status(400).json({ error: "No attendance record for today" }); return; }

    // Find the open break
    const [openBreak] = await db
      .select()
      .from(attendanceBreaksTable)
      .where(and(eq(attendanceBreaksTable.attendanceRecordId, record.id), isNull(attendanceBreaksTable.breakEnd)))
      .orderBy(desc(attendanceBreaksTable.breakStart));

    if (!openBreak) { res.status(400).json({ error: "No active break to end" }); return; }

    const breakEnd = new Date();
    const durationMinutes = (breakEnd.getTime() - new Date(openBreak.breakStart).getTime()) / 60000;

    await db.update(attendanceBreaksTable)
      .set({ breakEnd, durationMinutes })
      .where(eq(attendanceBreaksTable.id, openBreak.id));

    const [updated] = await db.select().from(attendanceBreaksTable).where(eq(attendanceBreaksTable.id, openBreak.id));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/attendance/monthly", requireAuth, async (req, res) => {
  try {
    const { month, year, employeeId } = req.query as Record<string, string>;
    // Fetch active employees to build an allow-list
    const activeEmps = await db.select({ id: employeesTable.id }).from(employeesTable)
      .where(inArray(employeesTable.status, ["active", "probation", "on_leave"]));
    const activeIds = new Set(activeEmps.map((e) => e.id));

    const all = await db.select().from(attendanceRecordsTable);
    const filtered = all.filter((r) => {
      if (!activeIds.has(r.employeeId)) return false; // hide inactive employees
      const d = new Date(r.date);
      const matchMonth = d.getMonth() + 1 === parseInt(month);
      const matchYear = d.getFullYear() === parseInt(year);
      const matchEmp = employeeId ? r.employeeId === employeeId : true;
      return matchMonth && matchYear && matchEmp;
    });
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/attendance/team", requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const role = req.user?.role ?? "employee";

    let employeeList;
    if (role === "employee") {
      // Employees see only their own record
      const [self] = await db.select().from(employeesTable)
        .where(eq(employeesTable.userId, req.user!.id));
      employeeList = self ? [self] : [];
    } else if (role === "manager") {
      // Managers see their direct reports
      const [mgr] = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(eq(employeesTable.userId, req.user!.id));
      employeeList = mgr
        ? await db.select().from(employeesTable)
            .where(and(eq(employeesTable.status, "active"), eq(employeesTable.reportingManagerId, mgr.id)))
        : [];
    } else {
      // hr_admin / super_admin / it_admin — all active employees
      employeeList = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    }

    const records = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.date, today));
    const recordMap = new Map(records.map((r) => [r.employeeId, r]));

    // Cross-reference approved leaves so on-leave employees show as "on_leave" not "absent"
    const todayLeaves = await db
      .select({ employeeId: leaveRequestsTable.employeeId })
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.status, "approved"),
          lte(leaveRequestsTable.startDate, today),
          gte(leaveRequestsTable.endDate, today)
        )
      );
    const onLeaveIds = new Set(todayLeaves.map((l) => l.employeeId));

    const result = await Promise.all(
      employeeList.map(async (emp) => {
        const rec = recordMap.get(emp.id);
        let dept = null;
        if (emp.departmentId) {
          const [d] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId));
          dept = d?.name ?? null;
        }
        return {
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          department: dept,
          status: rec ? rec.type : onLeaveIds.has(emp.id) ? "on_leave" : "absent",
          clockIn: rec?.clockIn?.toISOString() ?? null,
          type: rec?.type ?? null,
        };
      })
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/attendance/overtime", requireAuth, async (req, res) => {
  try {
    const otId = crypto.randomUUID();
    await db.insert(overtimeLogsTable).values({ ...req.body, id: otId });
    const [log] = await db.select().from(overtimeLogsTable).where(eq(overtimeLogsTable.id, otId));
    res.status(201).json(log);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/holidays", requireAuth, async (req, res) => {
  try {
    const { year } = req.query as Record<string, string>;
    let holidays = await db.select().from(holidaysTable);
    if (year) holidays = holidays.filter((h) => h.year === parseInt(year));
    res.json(holidays);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/holidays", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { name, date } = req.body as { name?: string; date?: string };
    if (!name || !name.trim()) { res.status(400).json({ error: "Holiday name is required" }); return; }
    if (!date || !date.trim()) { res.status(400).json({ error: "Holiday date is required" }); return; }
    const holId = crypto.randomUUID();
    await db.insert(holidaysTable).values({ ...req.body, name: name.trim(), id: holId });
    const [holiday] = await db.select().from(holidaysTable).where(eq(holidaysTable.id, holId));
    res.status(201).json(holiday);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AT-10 / BI-03: Bulk attendance export as CSV ──
router.get("/attendance/export", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const { month, year } = req.query as Record<string, string>;
    const m = parseInt(month);
    const y = parseInt(year);
    if (!m || !y) { res.status(400).json({ error: "month and year are required" }); return; }

    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    const allRecords = await db.select().from(attendanceRecordsTable);
    const depts = await db.select().from(departmentsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));

    const filtered = allRecords.filter((r) => {
      const d = new Date(r.date);
      return d.getMonth() + 1 === m && d.getFullYear() === y;
    });

    const headers = ["Employee Code", "Name", "Department", "Date", "Type", "Clock In", "Clock Out", "Hours Worked", "Late", "Half Day"];
    const rows = filtered.map((r) => {
      const emp = employees.find((e) => e.id === r.employeeId);
      return [
        emp?.employeeCode ?? "",
        emp ? `${emp.firstName} ${emp.lastName}` : "",
        emp?.departmentId ? (deptMap.get(emp.departmentId) ?? "") : "",
        r.date,
        r.type,
        r.clockIn?.toISOString() ?? "",
        r.clockOut?.toISOString() ?? "",
        r.hoursWorked?.toFixed(1) ?? "",
        r.isLate ? "Yes" : "No",
        r.isHalfDay ? "Yes" : "No",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    });

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=attendance_${y}_${m}.csv`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AU-19: WFH approval by manager ──
router.post("/attendance/wfh/:id/approve", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res): Promise<void> => {
  try {
    const recordId = req.params.id as string;
    const { approved } = req.body as { approved: boolean };
    const [record] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, recordId));
    if (!record) { res.status(404).json({ error: "Record not found" }); return; }
    if (record.type !== "wfh_pending") { res.status(400).json({ error: "Record is not pending WFH approval" }); return; }

    if (approved) {
      await db.update(attendanceRecordsTable).set({ type: "wfh" }).where(eq(attendanceRecordsTable.id, recordId));
    } else {
      await db.delete(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, recordId));
    }

    const [updated] = approved
      ? await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, recordId))
      : [null];

    notifyEmployee(record.employeeId, {
      type: approved ? "wfh.approved" : "wfh.rejected",
      title: approved ? "WFH request approved ✓" : "WFH request rejected",
      body: approved ? `Your Work From Home request for ${record.date} has been approved.` : `Your WFH request for ${record.date} was not approved.`,
      link: "/attendance/my",
    }).catch(console.error);

    res.json({ approved, record: updated });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/holidays/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const { name, date, type } = req.body as { name?: string; date?: string; type?: string };
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (date !== undefined) updateData.date = date;
    if (type !== undefined) updateData.type = type;
    if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
    await db.update(holidaysTable).set(updateData).where(eq(holidaysTable.id, id));
    const [holiday] = await db.select().from(holidaysTable).where(eq(holidaysTable.id, id));
    if (!holiday) { res.status(404).json({ error: "Holiday not found" }); return; }
    res.json(holiday);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/holidays/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.delete(holidaysTable).where(eq(holidaysTable.id, (req.params.id as string)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── ATTENDANCE REGULARIZATION ──

router.post("/attendance/regularization", requireAuth, async (req, res): Promise<void> => {
  try {
    const { employeeId: clientId, date, requestedClockIn, requestedClockOut, reason } = req.body as Record<string, string>;
    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;
    if (!date) { res.status(400).json({ error: "Date is required" }); return; }
    if (!reason || !reason.trim()) { res.status(400).json({ error: "Reason is required" }); return; }

    const id = crypto.randomUUID();
    await db.insert(attendanceRegularizationsTable).values({
      id,
      employeeId,
      date,
      requestedClockIn: requestedClockIn ? new Date(`${date}T${requestedClockIn}`) : null,
      requestedClockOut: requestedClockOut ? new Date(`${date}T${requestedClockOut}`) : null,
      reason: reason.trim(),
      status: "pending",
    });

    const [created] = await db.select().from(attendanceRegularizationsTable).where(eq(attendanceRegularizationsTable.id, id));
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/attendance/regularization", requireAuth, async (req, res): Promise<void> => {
  try {
    const { employeeId: clientId } = req.query as Record<string, string>;
    let employeeId: string | undefined;

    if (isPrivileged(req)) {
      employeeId = clientId; // hr_admin/super_admin can filter by employee, or omit for all
    } else {
      const resolved = await resolveEmployeeId(req, res, clientId);
      if (!resolved) return;
      employeeId = resolved;
    }

    const rows = await db
      .select()
      .from(attendanceRegularizationsTable)
      .where(employeeId ? eq(attendanceRegularizationsTable.employeeId, employeeId) : undefined)
      .orderBy(desc(attendanceRegularizationsTable.createdAt))
      .limit(100);

    // Attach employee names
    const empIds = [...new Set(rows.map((r) => r.employeeId))];
    const emps = empIds.length
      ? await db.select({ id: employeesTable.id, firstName: employeesTable.firstName, lastName: employeesTable.lastName })
          .from(employeesTable)
          .where(inArray(employeesTable.id, empIds))
      : [];
    const empMap = new Map(emps.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

    res.json(rows.map((r) => ({ ...r, employeeName: empMap.get(r.employeeId) ?? "" })));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/attendance/regularization/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { status, reviewNote } = req.body as { status: string; reviewNote?: string };
    if (!["approved", "rejected"].includes(status)) { res.status(400).json({ error: "Status must be approved or rejected" }); return; }

    await db.update(attendanceRegularizationsTable)
      .set({ status, reviewNote: reviewNote ?? null, reviewedAt: new Date() })
      .where(eq(attendanceRegularizationsTable.id, id));

    // On approval: patch or create the attendance record
    if (status === "approved") {
      const [reg] = await db.select().from(attendanceRegularizationsTable).where(eq(attendanceRegularizationsTable.id, id));
      if (reg) {
        const [existing] = await db.select().from(attendanceRecordsTable)
          .where(and(eq(attendanceRecordsTable.employeeId, reg.employeeId), eq(attendanceRecordsTable.date, reg.date)));

        if (existing) {
          await db.update(attendanceRecordsTable)
            .set({
              clockIn: reg.requestedClockIn ?? existing.clockIn,
              clockOut: reg.requestedClockOut ?? existing.clockOut,
            })
            .where(eq(attendanceRecordsTable.id, existing.id));
        } else {
          await db.insert(attendanceRecordsTable).values({
            id: crypto.randomUUID(),
            employeeId: reg.employeeId,
            date: reg.date,
            clockIn: reg.requestedClockIn ?? undefined,
            clockOut: reg.requestedClockOut ?? undefined,
            type: "wfo",
            isLate: false,
            isHalfDay: false,
          });
        }
      }
    }

    const [updated] = await db.select().from(attendanceRegularizationsTable).where(eq(attendanceRegularizationsTable.id, id));

    // Notify employee of outcome
    if (updated) {
      notifyEmployee(updated.employeeId, {
        type: status === "approved" ? "regularization.approved" : "regularization.rejected",
        title: status === "approved" ? "Attendance regularization approved ✓" : "Attendance regularization rejected",
        body: `Your regularization request for ${updated.date} has been ${status}${reviewNote ? `. Note: ${reviewNote}` : ""}.`,
        link: "/attendance/my",
      }).catch(console.error);
    }

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTO CLOCK-OUT JOB
// Finds every WFO record for today (IST) that has a clock-in but no clock-out,
// closes any open breaks, and sets clockOut = 22:00 IST with full hours calc.
// Called by app.ts at 10 PM IST every day.
// ─────────────────────────────────────────────────────────────────────────────
export async function autoClockOutMissed(): Promise<void> {
  try {
    // Today's date in IST (YYYY-MM-DD)
    const todayIST = new Intl.DateTimeFormat("en-CA", {
      timeZone: COMPANY_TIMEZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());

    // Set clockOut to exactly 22:00:00 IST
    const autoClockOutIST = (() => {
      const [y, m, d] = todayIST.split("-").map(Number);
      // Build 22:00 IST as a UTC Date
      const ist22 = new Date(`${todayIST}T22:00:00+05:30`);
      return ist22;
    })();

    // Find all WFO records for today without a clock-out
    const openRecords = await db
      .select()
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.date, todayIST),
          eq(attendanceRecordsTable.type, "wfo"),
          isNull(attendanceRecordsTable.clockOut),
        ),
      );

    if (openRecords.length === 0) {
      console.log(`[auto-clockout] ${todayIST}: no open records — nothing to do`);
      return;
    }

    let closed = 0;
    for (const record of openRecords) {
      try {
        // 1. Close any open break at 22:00 IST
        const [openBreak] = await db
          .select()
          .from(attendanceBreaksTable)
          .where(and(eq(attendanceBreaksTable.attendanceRecordId, record.id), isNull(attendanceBreaksTable.breakEnd)));
        if (openBreak) {
          const breakEndTime = autoClockOutIST < new Date(openBreak.breakStart) ? new Date(openBreak.breakStart) : autoClockOutIST;
          const dur = (breakEndTime.getTime() - new Date(openBreak.breakStart).getTime()) / 60000;
          await db.update(attendanceBreaksTable)
            .set({ breakEnd: breakEndTime, durationMinutes: dur })
            .where(eq(attendanceBreaksTable.id, openBreak.id));
        }

        // 2. Total break time (including the one just closed)
        const allBreaks = await db
          .select()
          .from(attendanceBreaksTable)
          .where(eq(attendanceBreaksTable.attendanceRecordId, record.id));
        const totalBreakMs = allBreaks.reduce((sum, b) => {
          if (b.durationMinutes != null) return sum + b.durationMinutes * 60000;
          if (b.breakEnd) return sum + (new Date(b.breakEnd).getTime() - new Date(b.breakStart).getTime());
          return sum;
        }, 0);

        // 3. Calculate net hours worked
        const rawMs = record.clockIn
          ? autoClockOutIST.getTime() - new Date(record.clockIn).getTime()
          : 0;
        const netMs = Math.max(0, rawMs - totalBreakMs);
        const hoursWorked = netMs / 3600000;
        const isHalfDay = hoursWorked > 0 && hoursWorked < 4;

        // 4. Save auto-checkout
        await db.update(attendanceRecordsTable)
          .set({
            clockOut: autoClockOutIST,
            hoursWorked,
            isHalfDay,
            notes: (record.notes ? record.notes + " | " : "") + "Auto clocked-out at 10:00 PM",
          })
          .where(eq(attendanceRecordsTable.id, record.id));

        closed++;
      } catch (err) {
        console.error(`[auto-clockout] Failed for record ${record.id}:`, err);
      }
    }

    console.log(`[auto-clockout] ${todayIST}: auto-clocked out ${closed}/${openRecords.length} employees at 22:00 IST`);
  } catch (err) {
    console.error("[auto-clockout] Job failed:", err);
  }
}

// ── Scheduler helper ─────────────────────────────────────────────────────────
// Schedules `fn` to run at a specific IST hour (and optional minute) daily.
// Checks every minute whether the target time has been reached and not yet run today.
export function scheduleDailyIST(hour: number, fn: () => Promise<void>, minute = 0): void {
  let lastRunDate = "";

  setInterval(() => {
    const nowIST = new Intl.DateTimeFormat("en-US", {
      timeZone: COMPANY_TIMEZONE,
      hour: "numeric", minute: "numeric",
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());

    const h = parseInt(nowIST.find((p) => p.type === "hour")?.value ?? "0", 10);
    const m = parseInt(nowIST.find((p) => p.type === "minute")?.value ?? "0", 10);
    const dateStr = `${nowIST.find((p) => p.type === "year")?.value}-${nowIST.find((p) => p.type === "month")?.value}-${nowIST.find((p) => p.type === "day")?.value}`;

    if (h === hour && m >= minute && dateStr !== lastRunDate) {
      lastRunDate = dateStr;
      fn().catch((e) => console.error(`[scheduler] Daily IST ${hour}:${String(minute).padStart(2,"0")} job failed:`, e));
    }
  }, 60_000); // check every minute
}

export default router;
