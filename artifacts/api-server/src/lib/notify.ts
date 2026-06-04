/**
 * In-app notification helpers.
 * All functions are fire-and-forget — they never throw, just log errors.
 */

import { db, notificationsTable, employeesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

interface NotifPayload {
  type: string;
  title: string;
  body?: string;
  link?: string;
}

// ── Core insert ───────────────────────────────────────────────────────────────

async function insertNotification(userId: string, payload: NotifPayload): Promise<void> {
  await db.insert(notificationsTable).values({
    id: crypto.randomUUID(),
    userId,
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    link: payload.link ?? null,
  });
}

// ── Public helpers ────────────────────────────────────────────────────────────

/** Notify a specific user by their Clerk userId */
export async function notifyUser(userId: string, payload: NotifPayload): Promise<void> {
  try {
    await insertNotification(userId, payload);
  } catch (e) {
    console.error("[notify] notifyUser failed:", e);
  }
}

/** Notify an employee by their employee DB id (looks up userId) */
export async function notifyEmployee(employeeId: string, payload: NotifPayload): Promise<void> {
  try {
    const [emp] = await db
      .select({ userId: employeesTable.userId })
      .from(employeesTable)
      .where(eq(employeesTable.id, employeeId));
    if (!emp?.userId) return;
    await insertNotification(emp.userId, payload);
  } catch (e) {
    console.error("[notify] notifyEmployee failed:", e);
  }
}

/** Notify all active employees (e.g. announcements, birthdays) */
export async function notifyAllEmployees(payload: NotifPayload): Promise<void> {
  try {
    const emps = await db
      .select({ userId: employeesTable.userId })
      .from(employeesTable)
      .where(inArray(employeesTable.status, ["active", "probation"]));
    await Promise.all(
      emps.filter((e) => e.userId).map((e) => insertNotification(e.userId!, payload)),
    );
  } catch (e) {
    console.error("[notify] notifyAllEmployees failed:", e);
  }
}

/** Notify all HR admins and super admins */
export async function notifyHrAdmins(payload: NotifPayload): Promise<void> {
  try {
    const emps = await db
      .select({ userId: employeesTable.userId })
      .from(employeesTable)
      .where(inArray(employeesTable.role, ["hr_admin", "super_admin"]));
    await Promise.all(
      emps.filter((e) => e.userId).map((e) => insertNotification(e.userId!, payload)),
    );
  } catch (e) {
    console.error("[notify] notifyHrAdmins failed:", e);
  }
}
