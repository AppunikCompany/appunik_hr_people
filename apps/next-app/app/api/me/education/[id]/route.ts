import { db, employeesTable, employeeEducationTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { id } = await params;

    const [emp] = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(eq(employeesTable.userId, user.id));

    if (!emp) return Response.json({ error: "Not found" }, { status: 404 });

    await db
      .delete(employeeEducationTable)
      .where(and(eq(employeeEducationTable.id, id), eq(employeeEducationTable.employeeId, emp.id)));

    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
