import { db } from "@workspace/db";
import { financialYearConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const [config] = await db.select().from(financialYearConfigTable);
    if (!config) {
      const fyId = crypto.randomUUID();
      await db.insert(financialYearConfigTable).values({ id: fyId, startMonth: 4, startDay: 1, endMonth: 3, endDay: 31, currentYear: "2025-26" });
      const [created] = await db.select().from(financialYearConfigTable).where(eq(financialYearConfigTable.id, fyId));
      return Response.json(created);
    }
    return Response.json(config);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const body = await request.json();
    const [existing] = await db.select().from(financialYearConfigTable);
    if (!existing) {
      const newFyId = crypto.randomUUID();
      await db.insert(financialYearConfigTable).values({ ...body, id: newFyId });
      const [created] = await db.select().from(financialYearConfigTable).where(eq(financialYearConfigTable.id, newFyId));
      return Response.json(created);
    }
    await db.update(financialYearConfigTable).set(body).where(eq(financialYearConfigTable.id, existing.id));
    const [updated] = await db.select().from(financialYearConfigTable).where(eq(financialYearConfigTable.id, existing.id));
    return Response.json(updated);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
