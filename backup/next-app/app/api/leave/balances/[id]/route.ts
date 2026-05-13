import { db } from "@workspace/db";
import { leaveBalancesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    const body = await request.json();
    await db.update(leaveBalancesTable).set(body).where(eq(leaveBalancesTable.id, id));
    const [bal] = await db.select().from(leaveBalancesTable).where(eq(leaveBalancesTable.id, id));
    if (!bal) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(bal);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
