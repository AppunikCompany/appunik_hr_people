import { db } from "@workspace/db";
import { kraAssignmentsTable, reviewCyclesTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

async function enrichAssignment(a: typeof kraAssignmentsTable.$inferSelect) {
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, a.employeeId));
  const [cycle] = await db.select().from(reviewCyclesTable).where(eq(reviewCyclesTable.id, a.cycleId));
  return {
    ...a,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
    cycleName: cycle?.name ?? "",
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "manager"])) return forbidden();

    const { id } = await params;
    const body = await request.json();
    await db.update(kraAssignmentsTable).set(body).where(eq(kraAssignmentsTable.id, id));
    const [assignment] = await db.select().from(kraAssignmentsTable).where(eq(kraAssignmentsTable.id, id));
    if (!assignment) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(await enrichAssignment(assignment));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
