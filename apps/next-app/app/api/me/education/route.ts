import { db, employeesTable, employeeEducationTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const [emp] = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(eq(employeesTable.userId, user.id));

    if (!emp) return Response.json([]);

    const rows = await db
      .select()
      .from(employeeEducationTable)
      .where(eq(employeeEducationTable.employeeId, emp.id));

    return Response.json(rows);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const [emp] = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(eq(employeesTable.userId, user.id));

    if (!emp) return Response.json({ error: "Employee record not found" }, { status: 404 });

    const body = await request.json();
    const id = crypto.randomUUID();

    await db.insert(employeeEducationTable).values({
      id,
      employeeId: emp.id,
      institution: body.institution,
      degree: body.degree,
      fieldOfStudy: body.fieldOfStudy ?? null,
      startYear: body.startYear,
      endYear: body.endYear ?? null,
      grade: body.grade ?? null,
      certificateUrl: body.certificateUrl ?? null,
    });

    const [row] = await db
      .select()
      .from(employeeEducationTable)
      .where(eq(employeeEducationTable.id, id));

    return Response.json(row, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
