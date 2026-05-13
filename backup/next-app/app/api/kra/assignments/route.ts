import { db } from "@workspace/db";
import { kraAssignmentsTable, reviewCyclesTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole, isPrivileged } from "@/lib/auth";
import { fireAutomationEvent } from "@/lib/automations";

async function enrichAssignment(a: typeof kraAssignmentsTable.$inferSelect) {
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, a.employeeId));
  const [cycle] = await db.select().from(reviewCyclesTable).where(eq(reviewCyclesTable.id, a.cycleId));
  return {
    ...a,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
    cycleName: cycle?.name ?? "",
  };
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("employeeId") ?? undefined;
    const cycleId = searchParams.get("cycleId") ?? undefined;

    let assignments = await db.select().from(kraAssignmentsTable);

    if (!isPrivileged(user)) {
      // Employees can only see their own assignments
      const [self] = await db.select().from(employeesTable).where(eq(employeesTable.userId, user.id));
      if (!self) return Response.json({ error: "No employee record linked to your account" }, { status: 403 });
      assignments = assignments.filter((a) => a.employeeId === self.id);
    } else if (clientId) {
      assignments = assignments.filter((a) => a.employeeId === clientId);
    }

    if (cycleId) assignments = assignments.filter((a) => a.cycleId === cycleId);
    const enriched = await Promise.all(assignments.map(enrichAssignment));
    return Response.json(enriched);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "manager"])) return forbidden();

    const body = await request.json();
    const kraId = crypto.randomUUID();
    await db.insert(kraAssignmentsTable).values({ ...body, id: kraId });
    const [assignment] = await db.select().from(kraAssignmentsTable).where(eq(kraAssignmentsTable.id, kraId));
    const enriched = await enrichAssignment(assignment);

    fireAutomationEvent({ event: "kra.assigned", employeeId: assignment.employeeId }).catch(console.error);

    return Response.json(enriched, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
