import { db } from "@workspace/db";
import { leaveTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const types = await db.select().from(leaveTypesTable);
    return Response.json(types);
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
    const ltId = crypto.randomUUID();
    await db.insert(leaveTypesTable).values({ ...body, id: ltId });
    const [type] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, ltId));
    return Response.json(type, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
