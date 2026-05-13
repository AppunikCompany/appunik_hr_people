import { db, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function POST() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const [emp] = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(eq(employeesTable.userId, user.id));

    if (!emp) return Response.json({ error: "Employee record not found" }, { status: 404 });

    await db
      .update(employeesTable)
      .set({ onboardingCompleted: true, onboardingCompletedAt: new Date() })
      .where(eq(employeesTable.id, emp.id));

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
