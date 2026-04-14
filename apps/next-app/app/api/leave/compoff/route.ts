import { db } from "@workspace/db";
import { compoffsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") ?? undefined;

    let compoffs = await db.select().from(compoffsTable);
    if (employeeId) compoffs = compoffs.filter((c) => c.employeeId === employeeId);
    return Response.json(compoffs);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "manager"])) return forbidden();

    const body = await request.json();
    const coId = crypto.randomUUID();
    await db.insert(compoffsTable).values({ ...body, id: coId });
    const [compoff] = await db.select().from(compoffsTable).where(eq(compoffsTable.id, coId));
    return Response.json(compoff, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
