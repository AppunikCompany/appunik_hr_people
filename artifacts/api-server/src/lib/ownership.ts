import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { employeesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

export const PRIVILEGED_ROLES = new Set(["super_admin", "hr_admin", "it_admin", "manager"]);
export const DOCUMENT_ADMIN_ROLES = new Set(["super_admin", "hr_admin"]);

export function isPrivileged(req: Request): boolean {
  return PRIVILEGED_ROLES.has(req.user?.role ?? "");
}

/** Only HR and Super Admin may manage or view documents for other employees. */
export function isDocumentAdmin(req: Request): boolean {
  return DOCUMENT_ADMIN_ROLES.has(req.user?.role ?? "");
}

/** Resolve the employee record linked to the signed-in user. */
export async function getRequestEmployeeId(req: Request): Promise<string | null> {
  const userId = req.user?.id;
  if (!userId) return null;

  const email = req.user?.email;
  const conditions = email
    ? or(eq(employeesTable.userId, userId), eq(employeesTable.email, email))
    : eq(employeesTable.userId, userId);

  const [emp] = await db
    .select({ id: employeesTable.id, userId: employeesTable.userId })
    .from(employeesTable)
    .where(conditions);

  if (!emp) return null;

  if (emp.userId !== userId) {
    await db.update(employeesTable).set({ userId }).where(eq(employeesTable.id, emp.id));
  }

  return emp.id;
}

/** HR/Super Admin may read any employee's documents; others may read only their own. */
export async function canReadEmployeeDocuments(
  req: Request,
  res: Response,
  employeeId: string,
): Promise<boolean> {
  if (isDocumentAdmin(req)) return true;

  const ownEmployeeId = await getRequestEmployeeId(req);
  if (!ownEmployeeId || ownEmployeeId !== employeeId) {
    res.status(403).json({ error: "Access denied: you can only view your own documents" });
    return false;
  }

  return true;
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
  // Privileged users (hr_admin, super_admin) may pass a clientEmployeeId to act
  // on behalf of another employee. If they DON'T pass one, fall through and
  // resolve their own employee record so they can clock in/out for themselves.
  if (isPrivileged(req) && clientEmployeeId) {
    return clientEmployeeId;
  }

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  // Look up by userId. Also fall back to email match in case the userId
  // wasn't re-linked yet (e.g. middleware ran before the DB update committed).
  const email = req.user?.email;
  const conditions = email
    ? or(eq(employeesTable.userId, userId), eq(employeesTable.email, email))
    : eq(employeesTable.userId, userId);

  const [emp] = await db.select().from(employeesTable).where(conditions);

  if (!emp) {
    res.status(403).json({ error: "No employee record linked to your account" });
    return null;
  }

  // If found by email but userId not yet set, link it now
  if (emp.userId !== userId) {
    await db.update(employeesTable).set({ userId }).where(eq(employeesTable.id, emp.id));
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
