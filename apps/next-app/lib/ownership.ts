import { db, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isPrivileged, type AuthUser } from "./auth";

/**
 * Resolve which employee ID to use for a write/read operation.
 * Returns { id } on success or { error, status } on failure.
 */
export async function resolveEmployeeId(
  user: AuthUser,
  clientEmployeeId?: string,
): Promise<{ id: string } | { error: string; status: number }> {
  if (isPrivileged(user)) {
    if (!clientEmployeeId)
      return { error: "employeeId is required", status: 400 };
    return { id: clientEmployeeId };
  }

  const [emp] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.userId, user.id));

  if (!emp)
    return {
      error: "No employee record linked to your account",
      status: 403,
    };

  if (clientEmployeeId && clientEmployeeId !== emp.id)
    return {
      error: "Access denied: cannot act on behalf of another employee",
      status: 403,
    };

  return { id: emp.id };
}

/**
 * Check read-access: privileged roles can see any employee record.
 * Employee role can only see their own record (matched by userId).
 */
export async function canReadEmployee(
  user: AuthUser,
  employeeId: string,
): Promise<boolean> {
  if (isPrivileged(user)) return true;

  const [emp] = await db
    .select({ id: employeesTable.id, userId: employeesTable.userId })
    .from(employeesTable)
    .where(eq(employeesTable.userId, user.id));

  return !!(emp && emp.id === employeeId);
}
