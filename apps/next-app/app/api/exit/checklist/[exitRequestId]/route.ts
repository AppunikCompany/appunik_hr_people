import { db } from "@workspace/db";
import { exitChecklistItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ exitRequestId: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { exitRequestId } = await params;
    const items = await db.select().from(exitChecklistItemsTable).where(eq(exitChecklistItemsTable.exitRequestId, exitRequestId));
    return Response.json(items);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
