import { db } from "@workspace/db";
import { employeeHistoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const history = await db.select().from(employeeHistoryTable).where(eq(employeeHistoryTable.employeeId, id));
    return Response.json(history);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    const body = await request.json();
    const histId = crypto.randomUUID();
    await db.insert(employeeHistoryTable).values({ ...body, id: histId, employeeId: id });
    const [entry] = await db.select().from(employeeHistoryTable).where(eq(employeeHistoryTable.id, histId));
    return Response.json(entry, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
