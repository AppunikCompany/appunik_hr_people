import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  employeesTable,
  attendanceRecordsTable,
  leaveRequestsTable,
  departmentsTable,
  designationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/reports/headcount", async (_req, res) => {
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

router.get("/reports/attendance", async (req, res) => {
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
      const overtimeHours = empRecs.reduce((s, r) => s + (r.hoursWorked ?? 0) - 8, 0);

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
        overtimeHours: Math.max(0, overtimeHours),
      };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/reports/lop", async (req, res) => {
  try {
    const { month, year } = req.query as Record<string, string>;
    const depts = await db.select().from(departmentsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));

    const result = employees.map((emp) => ({
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      department: emp.departmentId ? (deptMap.get(emp.departmentId) ?? null) : null,
      lopDays: 0,
      month: parseInt(month),
      year: parseInt(year),
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/reports/attrition", async (req, res) => {
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

    res.json({ year: y, totalExits: exits.length, byQuarter: quarters, avgTenureMonths: avgTenure });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
