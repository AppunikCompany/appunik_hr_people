import { db } from "@workspace/db";
import { companyProfileTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const [profile] = await db.select().from(companyProfileTable);
    if (!profile) {
      const cpId = crypto.randomUUID();
      await db.insert(companyProfileTable).values({ id: cpId, name: "My Company" });
      const [created] = await db.select().from(companyProfileTable).where(eq(companyProfileTable.id, cpId));
      return Response.json(created);
    }
    return Response.json(profile);
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
    const [existing] = await db.select().from(companyProfileTable);
    if (!existing) {
      const newCpId = crypto.randomUUID();
      await db.insert(companyProfileTable).values({ ...body, id: newCpId });
      const [created] = await db.select().from(companyProfileTable).where(eq(companyProfileTable.id, newCpId));
      return Response.json(created);
    }
    await db.update(companyProfileTable).set(body).where(eq(companyProfileTable.id, existing.id));
    const [updated] = await db.select().from(companyProfileTable).where(eq(companyProfileTable.id, existing.id));
    return Response.json(updated);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
