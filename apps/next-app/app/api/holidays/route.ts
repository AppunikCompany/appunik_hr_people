import { db } from "@workspace/db";
import { holidaysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year") ?? undefined;

    let holidays = await db.select().from(holidaysTable);
    if (year) holidays = holidays.filter((h) => h.year === parseInt(year));
    return Response.json(holidays);
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
    const holId = crypto.randomUUID();
    await db.insert(holidaysTable).values({ ...body, id: holId });
    const [holiday] = await db.select().from(holidaysTable).where(eq(holidaysTable.id, holId));
    return Response.json(holiday, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
