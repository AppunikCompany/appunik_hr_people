import { db } from "@workspace/db";
import { investmentDeclarationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole, isPrivileged } from "@/lib/auth";
import { resolveEmployeeId } from "@/lib/ownership";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const [existing] = await db.select().from(investmentDeclarationsTable).where(eq(investmentDeclarationsTable.id, id));
    if (!existing) return Response.json({ error: "Declaration not found" }, { status: 404 });

    const result = await resolveEmployeeId(user);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    const employeeId = result.id;

    if (existing.employeeId !== employeeId && !isPrivileged(user)) {
      return Response.json({ error: "Access denied" }, { status: 403 });
    }
    if (!["declared", "proof_submitted"].includes(existing.status) && !isPrivileged(user)) {
      return Response.json({ error: "Only editable in declared/proof_submitted state" }, { status: 400 });
    }

    const body = await request.json() as Record<string, unknown>;
    const { section, category, declaredAmount, proofUrl, notes, status } = body;
    const updates: Record<string, unknown> = {};
    if (section !== undefined) updates.section = section;
    if (category !== undefined) updates.category = category;
    if (declaredAmount !== undefined) updates.declaredAmount = declaredAmount;
    if (proofUrl !== undefined) updates.proofUrl = proofUrl;
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined && ["declared", "proof_submitted"].includes(String(status))) updates.status = status;

    await db.update(investmentDeclarationsTable).set(updates).where(eq(investmentDeclarationsTable.id, id));
    const [updated] = await db.select().from(investmentDeclarationsTable).where(eq(investmentDeclarationsTable.id, id));
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
    await db.delete(investmentDeclarationsTable).where(eq(investmentDeclarationsTable.id, id));
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
