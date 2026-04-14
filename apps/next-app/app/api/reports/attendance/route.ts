import { db } from "@workspace/db";
import { employeesTable, attendanceRecordsTable, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "manager"])) return forbidden();

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") ?? "";
    const year = searchParams.get("year") ?? "";
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

    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
