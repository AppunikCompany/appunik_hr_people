import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  attendanceRecordsTable,
  overtimeLogsTable,
  holidaysTable,
  employeesTable,
  departmentsTable,
  appConfigTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { resolveEmployeeId, canReadEmployee, isPrivileged } from "../lib/ownership";
import { fireAutomationEvent } from "../lib/automations";

const router: IRouter = Router();

router.post("/attendance/clock-in", requireAuth, async (req, res): Promise<void> => {
  try {
    const { employeeId: clientId, notes } = req.body as { employeeId?: string; notes?: string };
    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;

    const today = new Date().toISOString().split("T")[0];
    const existing = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));

    if (existing.length > 0) {
      res.status(400).json({ error: "Already clocked in today" });
      return;
    }

    const clockIn = new Date();
    const isLate = clockIn.getHours() > 9 || (clockIn.getHours() === 9 && clockIn.getMinutes() > 30);
    // If clocking in after 13:00 it counts as a half-day
    const isHalfDay = clockIn.getHours() >= 13;
    const recId = crypto.randomUUID();
    await db.insert(attendanceRecordsTable).values({ id: recId, employeeId, date: today, clockIn, type: "wfo", isLate, isHalfDay, notes });
    const [record] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, recId));
    if (isLate) {
      fireAutomationEvent({ event: "attendance.late_arrival", employeeId, variables: { date: today } }).catch(console.error);
    }
    res.status(201).json(record);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/attendance/clock-out", requireAuth, async (req, res): Promise<void> => {
  try {
    const { employeeId: clientId, notes } = req.body as { employeeId?: string; notes?: string };
    const employeeId = await resolveEmployeeId(req, res, clientId);
    if (!employeeId) return;

    const today = new Date().toISOString().split("T")[0];
    const [existing] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));

    if (!existing) { res.status(404).json({ error: "No clock-in found for today" }); return; }

    const clockOut = new Date();
    const hoursWorked = existing.clockIn
      ? (clockOut.getTime() - new Date(existing.clockIn).getTime()) / 3600000
      : null;
    // Mark half-day if hours worked < 4 (and not already a half-day from late clock-in)
    const isHalfDay = existing.isHalfDay || (hoursWorked !== null && hoursWorked < 4);

    await db.update(attendanceRecordsTable).set({ clockOut, hoursWorked, isHalfDay, notes: notes ?? existing.notes }).where(eq(attendanceRecordsTable.id, existing.id));
    const [record] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, existing.id));
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/attendance/wfh", requireAuth, async (req, res): Promise<void> => {
  try {
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

    // WFH cutoff: cannot mark WFH at or after 10:00 AM
    const now = new Date();
    if (now.getHours() >= 10) {
      res.status(400).json({ error: "WFH can only be marked before 10:00 AM" });
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
    let employeeId: string | null = null;
    if (isPrivileged(req)) {
      employeeId = clientId ?? "";
    } else {
      employeeId = await resolveEmployeeId(req, res, clientId);
      if (!employeeId) return;
    }
    const today = new Date().toISOString().split("T")[0];
    const [record] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));
    res.json(record ?? null);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/attendance/monthly", requireAuth, async (req, res) => {
  try {
    const { month, year, employeeId } = req.query as Record<string, string>;
    const all = await db.select().from(attendanceRecordsTable);
    const filtered = all.filter((r) => {
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

router.get("/attendance/team", requireAuth, async (_req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    const records = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.date, today));
    const recordMap = new Map(records.map((r) => [r.employeeId, r]));

    const result = await Promise.all(
      employees.map(async (emp) => {
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
          status: rec ? rec.type : "absent",
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
    res.json({ approved, record: updated });
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
    const clockIn = requestedClockIn ? new Date(requestedClockIn) : null;
    const clockOut = requestedClockOut ? new Date(requestedClockOut) : null;

    await (db as any).execute(
      `INSERT INTO people_attendance_regularizations (id, employee_id, date, requested_clock_in, requested_clock_out, reason, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [id, employeeId, date, clockIn, clockOut, reason.trim()]
    );

    res.status(201).json({ id, employeeId, date, requestedClockIn, requestedClockOut, reason: reason.trim(), status: "pending" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/attendance/regularization", requireAuth, async (req, res): Promise<void> => {
  try {
    const { employeeId: clientId } = req.query as Record<string, string>;
    let employeeId: string | undefined;

    if (isPrivileged(req)) {
      employeeId = clientId;
    } else {
      const resolved = await resolveEmployeeId(req, res, clientId);
      if (!resolved) return;
      employeeId = resolved;
    }

    let query = `SELECT r.*, CONCAT(e.first_name, ' ', e.last_name) as employee_name FROM people_attendance_regularizations r JOIN people_employees e ON r.employee_id = e.id`;
    const params: any[] = [];

    if (employeeId) {
      query += ` WHERE r.employee_id = ?`;
      params.push(employeeId);
    }
    query += ` ORDER BY r.created_at DESC LIMIT 100`;

    const [rows] = await (db as any).execute(query, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/attendance/regularization/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { status, reviewNote } = req.body as { status: string; reviewNote?: string };
    if (!["approved", "rejected"].includes(status)) { res.status(400).json({ error: "Status must be approved or rejected" }); return; }

    const [userRow] = await (db as any).execute(`SELECT employee_id FROM people_users WHERE clerk_id = ? OR id = ?`, [(req as any).auth?.userId ?? "", (req as any).user?.id ?? ""]);
    const reviewerId = (req as any).user?.id ?? null;

    await (db as any).execute(
      `UPDATE people_attendance_regularizations SET status = ?, review_note = ?, reviewed_at = NOW() WHERE id = ?`,
      [status, reviewNote ?? null, id]
    );

    // If approved, update attendance record
    if (status === "approved") {
      const [[reg]] = await (db as any).execute(`SELECT * FROM people_attendance_regularizations WHERE id = ?`, [id]);
      if (reg) {
        // Check if record exists
        const [[existing]] = await (db as any).execute(
          `SELECT id FROM people_attendance_records WHERE employee_id = ? AND date = ?`,
          [reg.employee_id, reg.date]
        );
        if (existing) {
          await (db as any).execute(
            `UPDATE people_attendance_records SET clock_in = COALESCE(?, clock_in), clock_out = COALESCE(?, clock_out), updated_at = NOW() WHERE id = ?`,
            [reg.requested_clock_in, reg.requested_clock_out, existing.id]
          );
        } else {
          const newId = crypto.randomUUID();
          await (db as any).execute(
            `INSERT INTO people_attendance_records (id, employee_id, date, clock_in, clock_out, type, is_late, is_half_day) VALUES (?, ?, ?, ?, ?, 'wfo', 0, 0)`,
            [newId, reg.employee_id, reg.date, reg.requested_clock_in, reg.requested_clock_out]
          );
        }
      }
    }

    res.json({ id, status });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
