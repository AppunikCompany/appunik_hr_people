import { db, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const [emp] = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(eq(employeesTable.userId, user.id));

    if (!emp) {
      return Response.json({ error: "Employee record not found" }, { status: 404 });
    }

    const body = await request.json();
    const allowed = ["phone", "gender", "dateOfBirth", "address", "emergencyContact", "emergencyPhone"] as const;
    const update: Record<string, string> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key];
    }

    await db.update(employeesTable).set(update).where(eq(employeesTable.id, emp.id));

    const [updated] = await db.select().from(employeesTable).where(eq(employeesTable.id, emp.id));
    return Response.json(updated);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
