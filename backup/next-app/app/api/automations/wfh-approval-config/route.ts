import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const [cfg] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, "wfh_requires_approval"));
    return Response.json({ wfhRequiresApproval: cfg?.value === "true" });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { enabled } = await request.json() as { enabled: boolean };
    const value = String(enabled);
    const [existing] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, "wfh_requires_approval"));
    if (existing) {
      await db.update(appConfigTable).set({ value }).where(eq(appConfigTable.id, existing.id));
    } else {
      await db.insert(appConfigTable).values({ key: "wfh_requires_approval", value });
    }
    return Response.json({ wfhRequiresApproval: enabled });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
