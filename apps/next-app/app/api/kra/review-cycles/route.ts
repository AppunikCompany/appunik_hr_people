import { db } from "@workspace/db";
import { reviewCyclesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const cycles = await db.select().from(reviewCyclesTable);
    return Response.json(cycles);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const body = await request.json();
    const cycleId = crypto.randomUUID();
    await db.insert(reviewCyclesTable).values({ ...body, id: cycleId });
    const [cycle] = await db.select().from(reviewCyclesTable).where(eq(reviewCyclesTable.id, cycleId));
    return Response.json(cycle, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
