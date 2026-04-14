import { db } from "@workspace/db";
import { reimbursementsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "manager"])) return forbidden();

    const { id: claimId } = await params;
    const { status, comment } = await request.json() as { status: "approved" | "rejected"; comment?: string };

    if (!["approved", "rejected"].includes(status)) {
      return Response.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
    }

    const [existing] = await db.select().from(reimbursementsTable).where(eq(reimbursementsTable.id, claimId));
    if (!existing) return Response.json({ error: "Claim not found" }, { status: 404 });
    if (existing.status !== "pending") return Response.json({ error: "Claim is not pending" }, { status: 400 });

    await db.update(reimbursementsTable).set({
      status,
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewComment: comment ?? null,
    }).where(eq(reimbursementsTable.id, claimId));

    const [updated] = await db.select().from(reimbursementsTable).where(eq(reimbursementsTable.id, claimId));
    return Response.json(updated);
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
    await db.delete(reimbursementsTable).where(eq(reimbursementsTable.id, id));
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
