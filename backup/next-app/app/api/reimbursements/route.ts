import { db } from "@workspace/db";
import { reimbursementsTable, employeesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getAuthUser, unauthorized, isPrivileged } from "@/lib/auth";
import { resolveEmployeeId } from "@/lib/ownership";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const filterEmpId = searchParams.get("employeeId") ?? undefined;

    if (isPrivileged(user)) {
      let claims = await db.select().from(reimbursementsTable).orderBy(desc(reimbursementsTable.createdAt));
      if (filterEmpId) claims = claims.filter((c) => c.employeeId === filterEmpId);

      // Enrich with employee name
      const employees = await db.select().from(employeesTable);
      const empMap = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
      const enriched = claims.map((c) => ({ ...c, employeeName: empMap.get(c.employeeId) ?? "" }));
      return Response.json(enriched);
    } else {
      const result = await resolveEmployeeId(user);
      if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
      const employeeId = result.id;
      const claims = await db
        .select()
        .from(reimbursementsTable)
        .where(eq(reimbursementsTable.employeeId, employeeId))
        .orderBy(desc(reimbursementsTable.createdAt));
      return Response.json(claims);
    }
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { employeeId: clientId, category, amount, description, receiptUrl, expenseDate } = await request.json() as {
      employeeId?: string;
      category: string;
      amount: number;
      description?: string;
      receiptUrl?: string;
      expenseDate: string;
    };

    const result = await resolveEmployeeId(user, clientId);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    const employeeId = result.id;

    const id = crypto.randomUUID();
    await db.insert(reimbursementsTable).values({
      id,
      employeeId,
      category,
      amount,
      description: description ?? null,
      receiptUrl: receiptUrl ?? null,
      expenseDate,
    });
    const [claim] = await db.select().from(reimbursementsTable).where(eq(reimbursementsTable.id, id));
    return Response.json(claim, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
