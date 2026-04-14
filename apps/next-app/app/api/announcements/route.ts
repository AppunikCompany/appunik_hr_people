import { db } from "@workspace/db";
import { announcementsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const announcements = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.isPinned), desc(announcementsTable.createdAt));
    const today = new Date().toISOString().split("T")[0];
    const active = announcements.filter(a => a.isActive && (!a.expiryDate || a.expiryDate >= today));
    return Response.json(active);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
