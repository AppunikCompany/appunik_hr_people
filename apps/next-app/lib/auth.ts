import { auth, currentUser } from "@clerk/nextjs/server";
import { db, usersTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type UserRole =
  | "super_admin"
  | "hr_admin"
  | "it_admin"
  | "manager"
  | "employee";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: UserRole;
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

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (existing) {
      return {
        id: existing.id,
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
        profileImageUrl: existing.profileImageUrl,
        role: existing.role as UserRole,
      };
    }

    // Auto-create user from Clerk on first login
    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? null;

    try {
      await db.insert(usersTable).values({
        id: userId,
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        profileImageUrl: clerkUser.imageUrl,
        role: "employee",
      });
    } catch {
      // Already exists (race condition) — continue
    }

    // Auto-create linked employee record
    if (email) {
      const [existingEmp] = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.userId, userId));
      if (!existingEmp) {
        const code = await nextEmployeeCode();
        await db.insert(employeesTable).values({
          id: crypto.randomUUID(),
          employeeCode: code,
          firstName: clerkUser.firstName ?? "Unknown",
          lastName: clerkUser.lastName ?? "",
          email,
          joiningDate: new Date().toISOString().split("T")[0],
          userId,
        });
      }
    }

    const [created] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!created) return null;

    return {
      id: created.id,
      email: created.email,
      firstName: created.firstName,
      lastName: created.lastName,
      profileImageUrl: created.profileImageUrl,
      role: created.role as UserRole,
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
