import { db } from "@workspace/db";
import { employeesTable, departmentsTable } from "@workspace/db";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year") ?? "";
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

    return Response.json({
      year: y,
      totalExits: exits.length,
      byQuarter: quarters,
      avgTenureMonths: Math.round(avgTenure),
      byDepartment: Array.from(byDept.entries()).map(([department, count]) => ({ department, count })),
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
