import { db, employeesTable } from "@workspace/db";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin"])) return forbidden();

    const employees = await db.select().from(employeesTable);

    const result = employees.map((e) => ({
      id: e.userId ?? e.id,
      email: e.email,
      firstName: e.firstName,
      lastName: e.lastName,
      role: e.role,
      employeeId: e.id,
      employeeCode: e.employeeCode,
      createdAt: e.createdAt,
    }));

    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
