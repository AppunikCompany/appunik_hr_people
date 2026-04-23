import { auth, currentUser } from "@clerk/nextjs/server";
import { db, employeesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

export type UserRole =
  | "super_admin"
  | "hr_admin"
  | "it_admin"
  | "manager"
  | "employee"
  | "QA";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: UserRole;
  employeeId: string | null;
}

const BYPASS_AUTH =
  process.env.NODE_ENV !== "production" && !process.env.CLERK_SECRET_KEY;

const DEV_USER: AuthUser = {
  id: "dev-user",
  email: "dev@example.com",
  firstName: "Dev",
  lastName: "User",
  profileImageUrl: null,
  role: "hr_admin",
  employeeId: null,
};

async function nextEmployeeCode(): Promise<string> {
  const all = await db
    .select({ code: employeesTable.employeeCode })
    .from(employeesTable);
  const nums = all
    .map((e) => parseInt(e.code.replace("EMP-", ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `EMP-${String(next).padStart(3, "0")}`;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  if (BYPASS_AUTH) return DEV_USER;

  try {
    const { userId } = await auth();
    if (!userId) return null;

    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? null;

    // Look up the employee record by Clerk userId OR email (handles manually-added employees)
    const conditions = email
      ? or(eq(employeesTable.userId, userId), eq(employeesTable.email, email))
      : eq(employeesTable.userId, userId);

    const [existing] = await db
      .select()
      .from(employeesTable)
      .where(conditions);

    if (existing) {
      // Link userId if the record was found by email and not yet linked
      if (!existing.userId) {
        await db
          .update(employeesTable)
          .set({
            userId,
            profileImageUrl: clerkUser.imageUrl ?? existing.profileImageUrl,
          })
          .where(eq(employeesTable.id, existing.id));
      }

      return {
        id: userId,
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
        profileImageUrl: existing.profileImageUrl ?? clerkUser.imageUrl,
        role: (existing.role ?? "employee") as UserRole,
        employeeId: existing.id,
      };
    }

    // No existing employee — create one
    if (!email) return null;

    const code = await nextEmployeeCode();
    const empId = crypto.randomUUID();

    await db.insert(employeesTable).values({
      id: empId,
      employeeCode: code,
      firstName: clerkUser.firstName ?? "Unknown",
      lastName: clerkUser.lastName ?? "",
      email,
      joiningDate: new Date().toISOString().split("T")[0],
      userId,
      role: "employee",
      profileImageUrl: clerkUser.imageUrl ?? null,
    });

    return {
      id: userId,
      email,
      firstName: clerkUser.firstName ?? "Unknown",
      lastName: clerkUser.lastName ?? "",
      profileImageUrl: clerkUser.imageUrl ?? null,
      role: "employee",
      employeeId: empId,
    };
  } catch {
    return null;
  }
}

export function hasRole(user: AuthUser, roles: UserRole[]): boolean {
  return roles.includes(user.role);
}

export const PRIVILEGED_ROLES = new Set<UserRole>([
  "super_admin",
  "hr_admin",
  "it_admin",
  "manager",
]);

export function isPrivileged(user: AuthUser): boolean {
  return PRIVILEGED_ROLES.has(user.role);
}

/** Helpers to return standard error responses */
export function unauthorized() {
  return Response.json({ error: "Authentication required" }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "Insufficient permissions" }, { status: 403 });
}
