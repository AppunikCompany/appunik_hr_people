import { db, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, isPrivileged } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    // Privileged users (HR admins, managers, etc.) bypass onboarding
    if (isPrivileged(user)) return Response.json({ completed: true, employeeId: null });

    const [emp] = await db
      .select({
        id: employeesTable.id,
        onboardingCompleted: employeesTable.onboardingCompleted,
      })
      .from(employeesTable)
      .where(eq(employeesTable.userId, user.id));

    if (!emp) {
      return Response.json({ completed: true, employeeId: null });
    }

    return Response.json({ completed: emp.onboardingCompleted, employeeId: emp.id });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
