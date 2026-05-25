import { clerkClient } from "@clerk/express";
import { db, employeesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

/**
 * Resolve a Clerk userId into our local DB employee record.
 * If not found by userId, falls back to email match (links the record).
 * If not found at all, creates a new employee record.
 */
export async function resolveClerkUser(clerkUserId: string): Promise<AuthUser | null> {
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? null;

    const conditions = email
      ? or(eq(employeesTable.userId, clerkUserId), eq(employeesTable.email, email))
      : eq(employeesTable.userId, clerkUserId);

    const [existing] = await db.select().from(employeesTable).where(conditions);

    if (existing) {
      // Always sync userId if it's missing or points to a different Clerk account.
      // This handles: first login, Clerk account recreation, dev/prod userId mismatch.
      if (existing.userId !== clerkUserId) {
        await db
          .update(employeesTable)
          .set({ userId: clerkUserId, profileImageUrl: clerkUser.imageUrl ?? existing.profileImageUrl })
          .where(eq(employeesTable.id, existing.id));
      }
      return {
        id: clerkUserId,
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
        profileImageUrl: existing.profileImageUrl ?? clerkUser.imageUrl,
        role: (existing.role ?? "employee") as AuthUser["role"],
        permissions: {},
      };
    }

    if (!email) return null;

    // Create new employee record
    const empId = crypto.randomUUID();
    const all = await db.select({ code: employeesTable.employeeCode }).from(employeesTable);
    const nums = all.map((e) => parseInt(e.code.replace("EMP-", ""), 10)).filter((n) => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const employeeCode = `EMP-${String(next).padStart(3, "0")}`;

    await db.insert(employeesTable).values({
      id: empId,
      employeeCode,
      firstName: clerkUser.firstName ?? "Unknown",
      lastName: clerkUser.lastName ?? "",
      email,
      joiningDate: new Date().toISOString().split("T")[0],
      userId: clerkUserId,
      role: "employee",
      profileImageUrl: clerkUser.imageUrl ?? null,
    });

    return {
      id: clerkUserId,
      email,
      firstName: clerkUser.firstName ?? "Unknown",
      lastName: clerkUser.lastName ?? "",
      profileImageUrl: clerkUser.imageUrl ?? null,
      role: "employee",
      permissions: {},
    };
  } catch (err) {
    console.error("Failed to resolve Clerk user:", err);
    return null;
  }
}
