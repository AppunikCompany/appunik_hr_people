import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  employeesTable,
  departmentsTable,
  designationsTable,
  attendanceRecordsTable,
  attendanceBreaksTable,
  leaveRequestsTable,
  leaveBalancesTable,
  leaveTypesTable,
  assetsTable,
  assetAssignmentsTable,
  assetCategoriesTable,
  employeeDocumentsTable,
  kraAssignmentsTable,
  reviewCyclesTable,
} from "@workspace/db";
import { eq, and, desc, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { canReadEmployee } from "../lib/ownership";

const router: IRouter = Router();

router.get("/self-service/profile/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!(await canReadEmployee(req, res, empId))) return;
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, empId));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    const [dept] = emp.departmentId
      ? await db.select({ name: departmentsTable.name }).from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId))
      : [];
    const [desig] = emp.designationId
      ? await db.select({ name: designationsTable.name }).from(designationsTable).where(eq(designationsTable.id, emp.designationId))
      : [];
    const [mgr] = emp.reportingManagerId
      ? await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName }).from(employeesTable).where(eq(employeesTable.id, emp.reportingManagerId))
      : [];

    res.json({
      ...emp,
      departmentName: dept?.name ?? null,
      designationName: desig?.name ?? null,
      reportingManagerName: mgr ? `${mgr.firstName} ${mgr.lastName}` : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/self-service/attendance/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!(await canReadEmployee(req, res, empId))) return;

    const { month, year } = req.query as Record<string, string>;
    const all = await db
      .select()
      .from(attendanceRecordsTable)
      .where(eq(attendanceRecordsTable.employeeId, empId));

    let filtered = all;
    if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      filtered = all.filter((r) => {
        const d = new Date(r.date);
        return d.getMonth() + 1 === m && d.getFullYear() === y;
      });
    }

    const presentDays = filtered.filter((r) => r.type === "wfo" && !r.isHalfDay).length;
    const wfhDays = filtered.filter((r) => r.type === "wfh").length;
    const halfDays = filtered.filter((r) => r.isHalfDay).length;
    const lateDays = filtered.filter((r) => r.isLate).length;
    const totalHours = filtered.reduce((s, r) => s + (r.hoursWorked ?? 0), 0);

    // Fetch all breaks for these records in one query
    const recordIds = filtered.map((r) => r.id);
    const allBreaks = recordIds.length
      ? await db.select().from(attendanceBreaksTable)
          .where(eq(attendanceBreaksTable.employeeId, empId))
      : [];
    const breaksByRecord = new Map<string, typeof allBreaks>();
    for (const b of allBreaks) {
      if (!breaksByRecord.has(b.attendanceRecordId)) breaksByRecord.set(b.attendanceRecordId, []);
      breaksByRecord.get(b.attendanceRecordId)!.push(b);
    }

    const enriched = filtered
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 60)
      .map((r) => {
        const breaks = (breaksByRecord.get(r.id) ?? [])
          .sort((a, b) => new Date(a.breakStart).getTime() - new Date(b.breakStart).getTime())
          .map((b) => ({
            id: b.id,
            breakStart: b.breakStart?.toISOString() ?? null,
            breakEnd: b.breakEnd?.toISOString() ?? null,
            durationMinutes: b.durationMinutes ?? null,
          }));
        return { ...r, breaks };
      });

    res.json({
      records: enriched,
      summary: { presentDays, wfhDays, halfDays, lateDays, totalHours: Math.round(totalHours * 10) / 10 },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/self-service/leave-summary/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!(await canReadEmployee(req, res, empId))) return;

    const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));

    const balances = await db
      .select()
      .from(leaveBalancesTable)
      .where(and(eq(leaveBalancesTable.employeeId, empId), eq(leaveBalancesTable.year, year)));

    const leaveTypes = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.isActive, true));
    const ltMap = new Map(leaveTypes.map((lt) => [lt.id, lt]));

    const allRequests = await db
      .select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.employeeId, empId))
      .orderBy(desc(leaveRequestsTable.createdAt));

    const pendingByType = new Map<string, number>();
    for (const r of allRequests) {
      if (r.status === "pending") {
        pendingByType.set(r.leaveTypeId, (pendingByType.get(r.leaveTypeId) ?? 0) + r.days);
      }
    }

    const enrichedBalances = balances
      // Exclude balances for leave types that have been deactivated/deleted
      .filter((b) => ltMap.has(b.leaveTypeId))
      .map((b) => {
        const pending = pendingByType.get(b.leaveTypeId) ?? 0;
        // balance = remaining available (approval logic already decrements it)
        // allocated = balance + used; available = balance minus any still-pending requests
        return {
          ...b,
          allocated: b.balance + b.used,
          pending,
          leaveTypeName: ltMap.get(b.leaveTypeId)?.name ?? "Unknown",
          available: Math.max(0, b.balance - pending),
        };
      });

    const recentRequests = allRequests.slice(0, 10).map((r) => ({
      ...r,
      leaveTypeName: ltMap.get(r.leaveTypeId)?.name ?? "Leave",
    }));

    res.json({
      balances: enrichedBalances,
      recentRequests,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/self-service/assets/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!(await canReadEmployee(req, res, empId))) return;

    const assignments = await db
      .select()
      .from(assetAssignmentsTable)
      .where(and(
        eq(assetAssignmentsTable.employeeId, empId),
        isNull(assetAssignmentsTable.returnedAt)
      ));

    const assetIds = assignments.map((a) => a.assetId);
    const assets = assetIds.length > 0
      ? await Promise.all(assetIds.map(async (id) => {
          const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
          return asset ?? null;
        }))
      : [];

    const categories = await db.select().from(assetCategoriesTable);
    const catMap = new Map(categories.map((c) => [c.id, c.name]));

    const result = assignments.map((a) => {
      const asset = assets.find((ast) => ast?.id === a.assetId);
      return {
        assignmentId: a.id,
        assetId: a.assetId,
        assetName: asset?.name ?? "Unknown",
        assetCode: asset?.assetCode ?? "",
        category: asset ? (catMap.get(asset.categoryId) ?? "Uncategorized") : "",
        assignedAt: a.assignedAt,
        notes: a.notes,
      };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── SS-05: Employee document download (list own documents) ──
router.get("/self-service/documents/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!(await canReadEmployee(req, res, empId))) return;
    const docs = await db.select().from(employeeDocumentsTable).where(eq(employeeDocumentsTable.employeeId, empId));
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── SS-08: KRA Dashboard — view own KRAs, ratings, review status ──
router.get("/self-service/kra/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!(await canReadEmployee(req, res, empId))) return;

    const assignments = await db.select().from(kraAssignmentsTable).where(eq(kraAssignmentsTable.employeeId, empId));
    const cycles = await db.select().from(reviewCyclesTable);
    const cycleMap = new Map(cycles.map((c) => [c.id, c]));

    const result = assignments.map((a) => {
      const cycle = cycleMap.get(a.cycleId);
      return {
        ...a,
        cycleName: cycle?.name ?? "",
        cycleStatus: cycle?.status ?? "",
        cycleType: cycle?.cycleType ?? "",
      };
    });

    // Group by cycle
    const byCycle = new Map<string, { cycle: typeof cycles[0] | undefined; assignments: typeof result }>(); 
    for (const a of result) {
      const existing = byCycle.get(a.cycleId);
      if (existing) {
        existing.assignments.push(a);
      } else {
        byCycle.set(a.cycleId, { cycle: cycleMap.get(a.cycleId), assignments: [a] });
      }
    }

    const grouped = Array.from(byCycle.values()).map((g) => {
      const completed = g.assignments.filter((a) => a.status === "completed");
      const totalWeightedScore = completed.reduce((s, a) => s + (a.weightedScore ?? 0), 0);
      return {
        cycleId: g.cycle?.id ?? "",
        cycleName: g.cycle?.name ?? "",
        cycleStatus: g.cycle?.status ?? "",
        assignments: g.assignments,
        totalWeightedScore: Math.round(totalWeightedScore * 10) / 10,
        completedCount: completed.length,
        totalCount: g.assignments.length,
      };
    });

    res.json(grouped);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── SS-10: Personal data export (attendance or leave as CSV) ──
router.get("/self-service/export/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!(await canReadEmployee(req, res, empId))) return;
    const type = req.query.type as string;

    if (type === "attendance") {
      const records = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.employeeId, empId));
      const headers = ["Date", "Type", "Clock In", "Clock Out", "Hours Worked", "Late", "Half Day"];
      const rows = records.map((r) => [
        r.date, r.type, r.clockIn?.toISOString() ?? "", r.clockOut?.toISOString() ?? "",
        r.hoursWorked?.toFixed(1) ?? "", r.isLate ? "Yes" : "No", r.isHalfDay ? "Yes" : "No",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`));
      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=my_attendance.csv");
      res.send(csv);
    } else if (type === "leave") {
      const requests = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.employeeId, empId));
      const leaveTypes = await db.select().from(leaveTypesTable);
      const ltMap = new Map(leaveTypes.map((lt) => [lt.id, lt.name]));
      const headers = ["Leave Type", "Start Date", "End Date", "Days", "Status", "Reason"];
      const rows = requests.map((r) => [
        ltMap.get(r.leaveTypeId) ?? "", r.startDate, r.endDate, r.days, r.status, r.reason ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`));
      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=my_leave_history.csv");
      res.send(csv);
    } else {
      res.status(400).json({ error: "type must be 'attendance' or 'leave'" });
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── SS-01: Employee self-service profile update ──
router.patch("/self-service/profile/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!(await canReadEmployee(req, res, empId))) return;

    // Only allow updating personal fields, not employment/admin fields
    const { phone, address, emergencyContact, emergencyPhone, gender, dateOfBirth } = req.body as Record<string, string>;
    const updates: Record<string, unknown> = {};
    if (phone !== undefined) updates.phone = phone;
    if (address !== undefined) updates.address = address;
    if (emergencyContact !== undefined) updates.emergencyContact = emergencyContact;
    if (emergencyPhone !== undefined) updates.emergencyPhone = emergencyPhone;
    if (gender !== undefined) updates.gender = gender;
    if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    await db.update(employeesTable).set(updates).where(eq(employeesTable.id, empId));
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, empId));
    res.json(emp);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
