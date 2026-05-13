import { db } from "@workspace/db";
import { employeesTable, departmentsTable, designationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

type Employee = typeof employeesTable.$inferSelect;

async function enrichEmployee(emp: Employee) {
  let departmentName: string | null = null;
  let designationName: string | null = null;

  if (emp.departmentId) {
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId));
    departmentName = dept?.name ?? null;
  }
  if (emp.designationId) {
    const [desig] = await db.select().from(designationsTable).where(eq(designationsTable.id, emp.designationId));
    designationName = desig?.name ?? null;
  }

  return { ...emp, departmentName, designationName };
}

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    const enriched = await Promise.all(employees.map(enrichEmployee));
    const nodes = enriched.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      designation: e.designationName,
      department: e.departmentName,
      reportingManagerId: e.reportingManagerId,
    }));
    return Response.json(nodes);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
