import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

// Super admin list is permanently locked — cannot be granted or revoked via the app.
const LOCKED_SUPER_ADMIN_IDS = new Set([
  "user_3BTYJifFgKY8JX9HSuZO37z4Nyo", // Karan Panchal
  "user_3BUS7kFotpTtlKHSL15Buri0oYY", // Dhruv Khatri
  "user_3BUSRB6F5QIoqyVozGOB8BZah5d", // Yagnesh Khamar
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin"])) return forbidden();

    const { id: userId } = await params;
    const { role } = await request.json() as { role: string };

    // super_admin is a locked role — cannot be assigned or removed via the UI
    if (role === "super_admin") {
      return Response.json({ error: "super_admin is a locked role and cannot be assigned via the app." }, { status: 403 });
    }
    if (LOCKED_SUPER_ADMIN_IDS.has(userId)) {
      return Response.json({ error: "This user's role is permanently locked and cannot be changed." }, { status: 403 });
    }

    const validRoles = ["hr_admin", "it_admin", "manager", "employee"];
    if (!validRoles.includes(role)) {
      return Response.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 });
    }
    await db.update(usersTable).set({ role: role as any }).where(eq(usersTable.id, userId));
    const [updatedUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!updatedUser) return Response.json({ error: "User not found" }, { status: 404 });
    return Response.json(updatedUser);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
