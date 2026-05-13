import { db } from "@workspace/db";
import { departmentsTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "it_admin", "manager"])) return forbidden();

    const depts = await db.select().from(departmentsTable);
    const enriched = await Promise.all(
      depts.map(async (d) => {
        let headName: string | null = null;
        if (d.headId) {
          const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, d.headId));
          headName = emp ? `${emp.firstName} ${emp.lastName}` : null;
        }
        return { ...d, headName };
      })
    );
    return Response.json(enriched);
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
    const deptId = crypto.randomUUID();
    await db.insert(departmentsTable).values({ ...body, id: deptId });
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, deptId));
    return Response.json({ ...dept, headName: null }, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
