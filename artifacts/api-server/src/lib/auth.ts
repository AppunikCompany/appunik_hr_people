import { clerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

/**
 * Resolve a Clerk userId into our local DB user record.
 * If the user doesn't exist in our DB yet, create them from Clerk's user data.
 */
export async function resolveClerkUser(clerkUserId: string): Promise<AuthUser | null> {
  // Check if user already exists in our DB
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, clerkUserId));

  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      firstName: existing.firstName,
      lastName: existing.lastName,
      profileImageUrl: existing.profileImageUrl,
      role: existing.role as AuthUser["role"],
      permissions: {},
    };
  }

  // User doesn't exist — fetch from Clerk and create
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? null;

    await db
      .insert(usersTable)
      .values({
        id: clerkUserId,
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        profileImageUrl: clerkUser.imageUrl,
        role: "employee",
      });
    const [created] = await db.select().from(usersTable).where(eq(usersTable.id, clerkUserId));

    return {
      id: created.id,
      email: created.email,
      firstName: created.firstName,
      lastName: created.lastName,
      profileImageUrl: created.profileImageUrl,
      role: created.role as AuthUser["role"],
      permissions: {},
    };
  } catch (err) {
    console.error("Failed to resolve Clerk user:", err);
    return null;
  }
}
