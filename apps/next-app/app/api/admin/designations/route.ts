import { db } from "@workspace/db";
import { designationsTable, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "it_admin", "manager"])) return forbidden();

    const designations = await db.select().from(designationsTable);
    const depts = await db.select().from(departmentsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const result = designations.map((d) => ({
      ...d,
      departmentName: d.departmentId ? (deptMap.get(d.departmentId) ?? null) : null,
    }));
    return Response.json(result);
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
    const desigId = crypto.randomUUID();
    await db.insert(designationsTable).values({ ...body, id: desigId });
    const [desig] = await db.select().from(designationsTable).where(eq(designationsTable.id, desigId));
    return Response.json({ ...desig, departmentName: null }, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
