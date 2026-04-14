import { db } from "@workspace/db";
import { compoffsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const [compoff] = await db.select().from(compoffsTable).where(eq(compoffsTable.id, id));
    if (!compoff) return Response.json({ error: "Not found" }, { status: 404 });
    if (compoff.isUsed) return Response.json({ error: "Comp-off already used" }, { status: 400 });

    await db.update(compoffsTable).set({ isUsed: true, usedAt: new Date() }).where(eq(compoffsTable.id, id));
    const [updated] = await db.select().from(compoffsTable).where(eq(compoffsTable.id, id));
    return Response.json(updated);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
