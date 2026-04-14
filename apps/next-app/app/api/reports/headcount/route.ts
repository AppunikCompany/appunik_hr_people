import { db } from "@workspace/db";
import { employeesTable, departmentsTable, designationsTable } from "@workspace/db";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

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

    return Response.json({
      total: employees.length,
      byDepartment: Array.from(byDept.entries()).map(([department, count]) => ({ department, count })),
      byDesignation: Array.from(byDesig.entries()).map(([designation, count]) => ({ designation, count })),
      byEmploymentType: Array.from(byType.entries()).map(([type, count]) => ({ type, count })),
      byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
