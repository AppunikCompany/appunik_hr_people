import { db } from "@workspace/db";
import { usersTable, employeesTable } from "@workspace/db";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin"])) return forbidden();

    const users = await db.select().from(usersTable);
    // Enrich with employee link if exists
    const employees = await db.select().from(employeesTable);
    const empByUserId = new Map(employees.filter((e) => e.userId).map((e) => [e.userId, e]));

    const result = users.map((u) => {
      const emp = empByUserId.get(u.id);
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        employeeId: emp?.id ?? null,
        employeeCode: emp?.employeeCode ?? null,
        createdAt: u.createdAt,
      };
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
