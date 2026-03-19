import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const PRIVILEGED_ROLES = new Set(["super_admin", "hr_admin", "it_admin", "manager"]);

export function isPrivileged(req: Request): boolean {
  return PRIVILEGED_ROLES.has(req.user?.role ?? "");
}

/**
 * Resolve which employee ID to use for a write/read operation.
 * - Privileged roles may supply any clientEmployeeId.
 * - Employee role: looks up the employee whose userId === req.user.id.
 *   If clientEmployeeId is supplied and differs, a 403 is sent and null returned.
 */
export async function resolveEmployeeId(
  req: Request,
  res: Response,
  clientEmployeeId?: string,
): Promise<string | null> {
  if (isPrivileged(req)) {
    if (!clientEmployeeId) {
      res.status(400).json({ error: "employeeId is required" });
      return null;
    }
    return clientEmployeeId;
  }

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const [emp] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.userId, userId));

  if (!emp) {
    res.status(403).json({ error: "No employee record linked to your account" });
    return null;
  }

  if (clientEmployeeId && clientEmployeeId !== emp.id) {
    res.status(403).json({ error: "Access denied: cannot act on behalf of another employee" });
    return null;
  }

  return emp.id;
}

/**
 * Check read-access: privileged roles can see any employee.
 * Employee role can only see their own record (matched by userId).
 */
export async function canReadEmployee(
  req: Request,
  res: Response,
  employeeId: string,
): Promise<boolean> {
  if (isPrivileged(req)) return true;

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }

  const [emp] = await db
    .select({ id: employeesTable.id, userId: employeesTable.userId })
    .from(employeesTable)
    .where(eq(employeesTable.userId, userId));

  if (!emp || emp.id !== employeeId) {
    res.status(403).json({ error: "Access denied" });
    return false;
  }

  return true;
}
