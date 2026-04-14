import { db } from "@workspace/db";
import { investmentDeclarationsTable, employeesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getAuthUser, unauthorized, isPrivileged } from "@/lib/auth";
import { resolveEmployeeId } from "@/lib/ownership";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const filterEmpId = searchParams.get("employeeId") ?? undefined;
    const financialYear = searchParams.get("financialYear") ?? undefined;

    if (isPrivileged(user)) {
      let rows = await db.select().from(investmentDeclarationsTable).orderBy(desc(investmentDeclarationsTable.createdAt));
      if (filterEmpId) rows = rows.filter((r) => r.employeeId === filterEmpId);
      if (financialYear) rows = rows.filter((r) => r.financialYear === financialYear);

      const employees = await db.select().from(employeesTable);
      const empMap = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
      const enriched = rows.map((r) => ({ ...r, employeeName: empMap.get(r.employeeId) ?? "" }));
      return Response.json(enriched);
    } else {
      const result = await resolveEmployeeId(user);
      if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
      const employeeId = result.id;

      let rows = await db
        .select()
        .from(investmentDeclarationsTable)
        .where(eq(investmentDeclarationsTable.employeeId, employeeId))
        .orderBy(desc(investmentDeclarationsTable.createdAt));
      if (financialYear) rows = rows.filter((r) => r.financialYear === financialYear);
      return Response.json(rows);
    }
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { employeeId: clientId, financialYear, section, category, declaredAmount, proofUrl, notes } = await request.json() as {
      employeeId?: string;
      financialYear: string;
      section: string;
      category: string;
      declaredAmount: number;
      proofUrl?: string;
      notes?: string;
    };

    const result = await resolveEmployeeId(user, clientId);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    const employeeId = result.id;

    const id = crypto.randomUUID();
    await db.insert(investmentDeclarationsTable).values({
      id,
      employeeId,
      financialYear,
      section,
      category,
      declaredAmount,
      proofUrl: proofUrl ?? null,
      notes: notes ?? null,
    });
    const [declaration] = await db.select().from(investmentDeclarationsTable).where(eq(investmentDeclarationsTable.id, id));
    return Response.json(declaration, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
