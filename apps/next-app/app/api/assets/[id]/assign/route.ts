import { db } from "@workspace/db";
import { assetsTable, assetAssignmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";
import { fireAutomationEvent } from "@/lib/automations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "it_admin"])) return forbidden();

    const { id } = await params;
    const { employeeId, notes } = await request.json() as { employeeId: string; notes?: string };
    const now = new Date();

    await db.update(assetsTable).set({ status: "assigned", assignedToId: employeeId, assignedAt: now }).where(eq(assetsTable.id, id));
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));

    if (!asset) return Response.json({ error: "Not found" }, { status: 404 });

    const assignId = crypto.randomUUID();
    await db.insert(assetAssignmentsTable).values({ id: assignId, assetId: id, employeeId, notes });
    const [assignment] = await db.select().from(assetAssignmentsTable).where(eq(assetAssignmentsTable.id, assignId));

    fireAutomationEvent({
      event: "asset.assigned",
      employeeId,
      variables: { assetName: asset.name, assetCode: asset.assetCode },
    }).catch(console.error);

    return Response.json(assignment);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
