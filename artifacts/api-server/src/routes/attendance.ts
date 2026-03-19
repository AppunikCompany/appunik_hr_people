import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  attendanceRecordsTable,
  overtimeLogsTable,
  holidaysTable,
  employeesTable,
  departmentsTable,
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
    const [record] = await db
      .insert(attendanceRecordsTable)
      .values({ employeeId, date: today, clockIn, type: "wfo", isLate, isHalfDay, notes })
      .returning();
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

    const [record] = await db
      .update(attendanceRecordsTable)
      .set({ clockOut, hoursWorked, isHalfDay, notes: notes ?? existing.notes })
      .where(eq(attendanceRecordsTable.id, existing.id))
      .returning();
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

    const [record] = await db
      .insert(attendanceRecordsTable)
      .values({ employeeId, date: today, type: "wfh", isLate: false, isHalfDay: false, notes })
      .returning();
    res.status(201).json(record);
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
    const [log] = await db.insert(overtimeLogsTable).values(req.body).returning();
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
    const [holiday] = await db.insert(holidaysTable).values(req.body).returning();
    res.status(201).json(holiday);
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

export default router;
