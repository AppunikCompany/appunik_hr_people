import { db } from "@workspace/db";
import { holidaysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    const body = await request.json();
    await db.update(holidaysTable).set(body).where(eq(holidaysTable.id, id));
    const [holiday] = await db.select().from(holidaysTable).where(eq(holidaysTable.id, id));
    if (!holiday) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(holiday);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    await db.delete(holidaysTable).where(eq(holidaysTable.id, id));
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
