import { db } from "@workspace/db";
import { employeesTable, departmentsTable, designationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";
import { canReadEmployee } from "@/lib/ownership";
import { fireAutomationEvent } from "@/lib/automations";

type Employee = typeof employeesTable.$inferSelect;

async function enrichEmployee(emp: Employee) {
  let departmentName: string | null = null;
  let designationName: string | null = null;
  let reportingManagerName: string | null = null;

  if (emp.departmentId) {
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId));
    departmentName = dept?.name ?? null;
  }
  if (emp.designationId) {
    const [desig] = await db.select().from(designationsTable).where(eq(designationsTable.id, emp.designationId));
    designationName = desig?.name ?? null;
  }
  if (emp.reportingManagerId) {
    const [mgr] = await db.select().from(employeesTable).where(eq(employeesTable.id, emp.reportingManagerId));
    reportingManagerName = mgr ? `${mgr.firstName} ${mgr.lastName}` : null;
  }

  return { ...emp, departmentName, designationName, reportingManagerName };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const canRead = await canReadEmployee(user, id);
    if (!canRead) return Response.json({ error: "Access denied" }, { status: 403 });

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
    if (!emp) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(await enrichEmployee(emp));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    const body = await request.json();

    const [before] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
    await db.update(employeesTable).set(body).where(eq(employeesTable.id, id));
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
    if (!emp) return Response.json({ error: "Not found" }, { status: 404 });

    // AM-10: When employee moves to notice/resigned/terminated, fire offboarding + asset return event
    if (before && before.status === "active" && (emp.status === "resigned" || emp.status === "terminated" || emp.status === "notice")) {
      fireAutomationEvent({ event: "employee.offboarding_started", employeeId: emp.id }).catch(console.error);
    }

    return Response.json(await enrichEmployee(emp));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    await db.delete(employeesTable).where(eq(employeesTable.id, id));
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
