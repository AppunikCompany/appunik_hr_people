import { db } from "@workspace/db";
import { leaveBalancesTable, leaveTypesTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { year } = await request.json() as { year: number };
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    const types = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.isActive, true));
    const existing = await db.select().from(leaveBalancesTable);
    const existingSet = new Set(existing.map((b) => `${b.employeeId}:${b.leaveTypeId}:${b.year}`));

    let created = 0;
    for (const emp of employees) {
      for (const lt of types) {
        const key = `${emp.id}:${lt.id}:${year}`;
        if (existingSet.has(key)) continue;
        if (lt.maxDaysPerYear === 0) continue; // Skip LOP / CO — managed separately
        await db.insert(leaveBalancesTable).values({
          id: crypto.randomUUID(),
          employeeId: emp.id,
          leaveTypeId: lt.id,
          balance: lt.maxDaysPerYear,
          used: 0,
          year,
        });
        created++;
      }
    }
    return Response.json({ year, created, employees: employees.length, types: types.length });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
