import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  employeesTable,
  attendanceRecordsTable,
  leaveRequestsTable,
  departmentsTable,
  designationsTable,
  assetsTable,
  assetCategoriesTable,
  kraAssignmentsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";

const router: IRouter = Router();

router.get("/reports/headcount", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (_req, res): Promise<void> => {
  try {
    const employees = await db.select().from(employeesTable);
    const departments = await db.select().from(departmentsTable);
    const designations = await db.select().from(designationsTable);

    const deptMap = new Map(departments.map((d) => [d.id, d.name]));
    const desigMap = new Map(designations.map((d) => [d.id, d.name]));

    const byDept = new Map<string, number>();
    const byDesig = new Map<string, number>();
    const byType = new Map<string, number>();
    const byStatus = new Map<string, number>();

    for (const emp of employees) {
      const dname = emp.departmentId ? (deptMap.get(emp.departmentId) ?? "Unknown") : "Unassigned";
      byDept.set(dname, (byDept.get(dname) ?? 0) + 1);

      const desname = emp.designationId ? (desigMap.get(emp.designationId) ?? "Unknown") : "Unassigned";
      byDesig.set(desname, (byDesig.get(desname) ?? 0) + 1);

      byType.set(emp.employmentType, (byType.get(emp.employmentType) ?? 0) + 1);
      byStatus.set(emp.status, (byStatus.get(emp.status) ?? 0) + 1);
    }

    res.json({
      total: employees.length,
      byDepartment: Array.from(byDept.entries()).map(([department, count]) => ({ department, count })),
      byDesignation: Array.from(byDesig.entries()).map(([designation, count]) => ({ designation, count })),
      byEmploymentType: Array.from(byType.entries()).map(([type, count]) => ({ type, count })),
      byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/reports/attendance", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res): Promise<void> => {
  try {
    const { month, year } = req.query as Record<string, string>;
    const m = parseInt(month);
    const y = parseInt(year);

    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    const allRecords = await db.select().from(attendanceRecordsTable);

    const depts = await db.select().from(departmentsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));

    const filtered = allRecords.filter((r) => {
      const d = new Date(r.date);
      return d.getMonth() + 1 === m && d.getFullYear() === y;
    });

    const result = employees.map((emp) => {
      const empRecs = filtered.filter((r) => r.employeeId === emp.id);
      const presentDays = empRecs.filter((r) => r.type === "wfo" && !r.isHalfDay).length;
      const wfhDays = empRecs.filter((r) => r.type === "wfh").length;
      const halfDays = empRecs.filter((r) => r.isHalfDay).length;
      const totalDays = presentDays + wfhDays + halfDays * 0.5;
      const overtimeHours = empRecs.reduce((s, r) => s + Math.max(0, (r.hoursWorked ?? 0) - 8), 0);

      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        department: emp.departmentId ? (deptMap.get(emp.departmentId) ?? null) : null,
        presentDays,
        wfhDays,
        absentDays: 0,
        halfDays,
        lopDays: 0,
        leaveDays: 0,
        totalDays,
        overtimeHours,
      };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/reports/wfh-ratio", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res): Promise<void> => {
  try {
    const { month, year } = req.query as Record<string, string>;
    const allRecords = await db.select().from(attendanceRecordsTable);
    const depts = await db.select().from(departmentsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));

    let filtered = allRecords;
    if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      filtered = allRecords.filter((r) => {
        const d = new Date(r.date);
        return d.getMonth() + 1 === m && d.getFullYear() === y;
      });
    }

    const wfoCount = filtered.filter((r) => r.type === "wfo").length;
    const wfhCount = filtered.filter((r) => r.type === "wfh").length;
    const total = wfoCount + wfhCount;

    const byDept = new Map<string, { wfo: number; wfh: number }>();
    for (const emp of employees) {
      const dname = emp.departmentId ? (deptMap.get(emp.departmentId) ?? "Unknown") : "Unassigned";
      const empRecs = filtered.filter((r) => r.employeeId === emp.id);
      const curr = byDept.get(dname) ?? { wfo: 0, wfh: 0 };
      curr.wfo += empRecs.filter((r) => r.type === "wfo").length;
      curr.wfh += empRecs.filter((r) => r.type === "wfh").length;
      byDept.set(dname, curr);
    }

    res.json({
      totalWfo: wfoCount,
      totalWfh: wfhCount,
      total,
      wfhPercentage: total > 0 ? Math.round((wfhCount / total) * 100) : 0,
      byDepartment: Array.from(byDept.entries()).map(([department, counts]) => ({
        department,
        wfo: counts.wfo,
        wfh: counts.wfh,
        total: counts.wfo + counts.wfh,
        wfhPercent: (counts.wfo + counts.wfh) > 0
          ? Math.round((counts.wfh / (counts.wfo + counts.wfh)) * 100)
          : 0,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/reports/asset-inventory", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (_req, res): Promise<void> => {
  try {
    const assets = await db.select().from(assetsTable);

    const categories = await db.select().from(assetCategoriesTable);
    const catMap = new Map(categories.map((c) => [c.id, c.name]));

    const byStatus = new Map<string, number>();
    const byCategory = new Map<string, number>();

    for (const asset of assets) {
      byStatus.set(asset.status, (byStatus.get(asset.status) ?? 0) + 1);
      const cat = catMap.get(asset.categoryId) ?? "Uncategorized";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
    }

    const assigned = assets.filter((a) => a.status === "assigned").length;
    const available = assets.filter((a) => a.status === "available").length;
    const maintenance = assets.filter((a) => a.status === "maintenance").length;
    const retired = assets.filter((a) => a.status === "retired").length;

    res.json({
      total: assets.length,
      assigned,
      available,
      maintenance,
      retired,
      utilizationRate: assets.length > 0 ? Math.round((assigned / assets.length) * 100) : 0,
      byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
      byCategory: Array.from(byCategory.entries()).map(([category, count]) => ({ category, count })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/reports/kra-summary", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (_req, res): Promise<void> => {
  try {
    const assignments = await db.select().from(kraAssignmentsTable);
    const employees = await db.select().from(employeesTable);
    const depts = await db.select().from(departmentsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const byStatus = new Map<string, number>();
    const byDept = new Map<string, { total: number; score: number; count: number }>();

    for (const a of assignments) {
      byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);

      const emp = empMap.get(a.employeeId);
      if (emp) {
        const dname = emp.departmentId ? (deptMap.get(emp.departmentId) ?? "Unknown") : "Unassigned";
        const curr = byDept.get(dname) ?? { total: 0, score: 0, count: 0 };
        curr.total += 1;
        if (a.weightedScore !== null && a.weightedScore !== undefined) {
          curr.score += a.weightedScore;
          curr.count += 1;
        }
        byDept.set(dname, curr);
      }
    }

    const completed = assignments.filter((a) => a.status === "completed");
    const avgScore = completed.length > 0
      ? completed.reduce((s, a) => s + (a.weightedScore ?? 0), 0) / completed.length
      : 0;

    res.json({
      total: assignments.length,
      byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
      avgFinalScore: Math.round(avgScore * 10) / 10,
      byDepartment: Array.from(byDept.entries()).map(([department, data]) => ({
        department,
        total: data.total,
        avgScore: data.count > 0 ? Math.round((data.score / data.count) * 10) / 10 : null,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/reports/lop", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res): Promise<void> => {
  try {
    const { month, year } = req.query as Record<string, string>;
    const depts = await db.select().from(departmentsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    const allLeaveReqs = await db.select().from(leaveRequestsTable);

    const lopRequests = allLeaveReqs.filter((l) => {
      if (l.status !== "approved") return false;
      if (!month || !year) return false;
      const d = new Date(l.startDate);
      return d.getMonth() + 1 === parseInt(month) && d.getFullYear() === parseInt(year);
    });

    const result = employees.map((emp) => {
      const empLops = lopRequests.filter((l) => l.employeeId === emp.id);
      const lopDays = empLops.reduce((s, l) => s + l.days, 0);
      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        department: emp.departmentId ? (deptMap.get(emp.departmentId) ?? null) : null,
        lopDays,
        month: parseInt(month),
        year: parseInt(year),
      };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/reports/attrition", requireAuth, requireRole("super_admin", "hr_admin", "manager"), async (req, res): Promise<void> => {
  try {
    const { year } = req.query as Record<string, string>;
    const y = parseInt(year);
    const employees = await db.select().from(employeesTable);
    const exits = employees.filter((e) => {
      if (!e.lastWorkingDay) return false;
      return new Date(e.lastWorkingDay).getFullYear() === y;
    });

    const quarters = [1, 2, 3, 4].map((q) => ({
      quarter: q,
      exits: exits.filter((e) => {
        const m = new Date(e.lastWorkingDay!).getMonth() + 1;
        return m >= (q - 1) * 3 + 1 && m <= q * 3;
      }).length,
    }));

    const avgTenure = exits.length > 0
      ? exits.reduce((sum, e) => {
          const join = new Date(e.joiningDate);
          const leave = new Date(e.lastWorkingDay!);
          return sum + (leave.getTime() - join.getTime()) / (1000 * 60 * 60 * 24 * 30);
        }, 0) / exits.length
      : 0;

    const depts = await db.select().from(departmentsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const byDept = new Map<string, number>();
    for (const e of exits) {
      const dname = e.departmentId ? (deptMap.get(e.departmentId) ?? "Unknown") : "Unassigned";
      byDept.set(dname, (byDept.get(dname) ?? 0) + 1);
    }

    res.json({
      year: y,
      totalExits: exits.length,
      byQuarter: quarters,
      avgTenureMonths: Math.round(avgTenure),
      byDepartment: Array.from(byDept.entries()).map(([department, count]) => ({ department, count })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
