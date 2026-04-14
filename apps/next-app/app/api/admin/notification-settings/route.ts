import { db } from "@workspace/db";
import { notificationSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const settings = await db.select().from(notificationSettingsTable);
    return Response.json(settings);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { eventType, isEnabled } = await request.json() as { eventType: string; isEnabled: boolean };
    await db.update(notificationSettingsTable).set({ isEnabled }).where(eq(notificationSettingsTable.eventType, eventType));
    const [setting] = await db.select().from(notificationSettingsTable).where(eq(notificationSettingsTable.eventType, eventType));
    if (!setting) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(setting);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
