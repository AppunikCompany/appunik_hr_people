import { db } from "@workspace/db";
import { announcementsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const announcements = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
    return Response.json(announcements);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
