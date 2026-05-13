import { db } from "@workspace/db";
import { exitChecklistItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { itemId } = await params;
    const { isCompleted, notes } = await request.json() as { isCompleted?: boolean; notes?: string };
    const updates: Record<string, unknown> = {};
    if (isCompleted !== undefined) {
      updates.isCompleted = isCompleted;
      updates.completedAt = isCompleted ? new Date() : null;
    }
    if (notes !== undefined) updates.notes = notes;
    await db.update(exitChecklistItemsTable).set(updates).where(eq(exitChecklistItemsTable.id, itemId));
    const [item] = await db.select().from(exitChecklistItemsTable).where(eq(exitChecklistItemsTable.id, itemId));
    return Response.json(item);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
