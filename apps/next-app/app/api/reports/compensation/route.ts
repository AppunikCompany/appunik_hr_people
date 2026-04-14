import { db } from "@workspace/db";
import { employeesTable, departmentsTable, designationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    const depts = await db.select().from(departmentsTable);
    const desigs = await db.select().from(designationsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const desigMap = new Map(desigs.map((d) => [d.id, d.name]));

    const byDept = new Map<string, { total: number; count: number }>();
    const byDesig = new Map<string, { total: number; count: number }>();

    for (const emp of employees) {
      const salary = (emp as any).grossSalary ?? 0;
      const dname = emp.departmentId ? (deptMap.get(emp.departmentId) ?? "Unknown") : "Unassigned";
      const curr = byDept.get(dname) ?? { total: 0, count: 0 };
      curr.total += salary;
      curr.count += 1;
      byDept.set(dname, curr);

      const desname = emp.designationId ? (desigMap.get(emp.designationId) ?? "Unknown") : "Unassigned";
      const currD = byDesig.get(desname) ?? { total: 0, count: 0 };
      currD.total += salary;
      currD.count += 1;
      byDesig.set(desname, currD);
    }

    const totalPayroll = employees.reduce((s, e) => s + ((e as any).grossSalary ?? 0), 0);

    return Response.json({
      totalEmployees: employees.length,
      totalMonthlyPayroll: totalPayroll,
      avgSalary: employees.length > 0 ? Math.round(totalPayroll / employees.length) : 0,
      byDepartment: Array.from(byDept.entries()).map(([department, data]) => ({
        department,
        totalSalary: data.total,
        headcount: data.count,
        avgSalary: data.count > 0 ? Math.round(data.total / data.count) : 0,
      })),
      byDesignation: Array.from(byDesig.entries()).map(([designation, data]) => ({
        designation,
        totalSalary: data.total,
        headcount: data.count,
        avgSalary: data.count > 0 ? Math.round(data.total / data.count) : 0,
      })),
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
