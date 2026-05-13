import { db } from "@workspace/db";
import { reviewCyclesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    const body = await request.json();
    await db.update(reviewCyclesTable).set(body).where(eq(reviewCyclesTable.id, id));
    const [cycle] = await db.select().from(reviewCyclesTable).where(eq(reviewCyclesTable.id, id));
    if (!cycle) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(cycle);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
