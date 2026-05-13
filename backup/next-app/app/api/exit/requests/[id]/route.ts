import { db } from "@workspace/db";
import { exitRequestsTable, exitChecklistItemsTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

async function enrichRequest(exitReq: typeof exitRequestsTable.$inferSelect, employees: typeof employeesTable.$inferSelect[]) {
  const emp = employees.find(e => e.id === exitReq.employeeId);
  const items = await db.select().from(exitChecklistItemsTable).where(eq(exitChecklistItemsTable.exitRequestId, exitReq.id));
  const completed = items.filter(i => i.isCompleted).length;
  return {
    ...exitReq,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
    employeeCode: emp?.employeeCode ?? "",
    checklistTotal: items.length,
    checklistDone: completed,
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "manager"])) return forbidden();

    const { id } = await params;
    const body = await request.json();
    await db.update(exitRequestsTable).set(body).where(eq(exitRequestsTable.id, id));
    const [exitReq] = await db.select().from(exitRequestsTable).where(eq(exitRequestsTable.id, id));
    if (!exitReq) return Response.json({ error: "Not found" }, { status: 404 });
    const employees = await db.select().from(employeesTable);
    return Response.json(await enrichRequest(exitReq, employees));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
