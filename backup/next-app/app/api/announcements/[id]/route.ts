import { db } from "@workspace/db";
import { announcementsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    const body = await request.json();
    await db.update(announcementsTable).set(body).where(eq(announcementsTable.id, id));
    const [ann] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, id));
    if (!ann) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(ann);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
