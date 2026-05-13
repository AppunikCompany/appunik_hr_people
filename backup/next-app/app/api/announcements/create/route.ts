import { db } from "@workspace/db";
import { announcementsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const body = await request.json();
    const id = crypto.randomUUID();
    await db.insert(announcementsTable).values({
      id,
      ...body,
      postedByUserId: user.id ?? null,
      postedByName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "HR",
    });
    const [ann] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, id));
    return Response.json(ann, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
