import { db, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return Response.json({ id: null, role: "guest" });
  }

  const [emp] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.userId, user.id));

  return Response.json({
    id: user.id,
    username: user.firstName,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
    email: user.email,
    role: user.role ?? "employee",
    employeeId: emp?.id ?? null,
  });
}
