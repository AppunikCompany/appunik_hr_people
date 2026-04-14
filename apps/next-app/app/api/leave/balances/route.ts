import { db } from "@workspace/db";
import { leaveBalancesTable, leaveTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") ?? undefined;
    const year = new Date().getFullYear();

    let balances = await db
      .select({
        balance: leaveBalancesTable,
        leaveType: leaveTypesTable,
      })
      .from(leaveBalancesTable)
      .leftJoin(leaveTypesTable, eq(leaveBalancesTable.leaveTypeId, leaveTypesTable.id));

    if (employeeId) balances = balances.filter((b) => b.balance.employeeId === employeeId);

    const result = balances
      .filter((b) => b.balance.year === year)
      .map((b) => ({
        id: b.balance.id,
        employeeId: b.balance.employeeId,
        leaveTypeId: b.balance.leaveTypeId,
        leaveTypeName: b.leaveType?.name ?? "",
        leaveTypeCode: b.leaveType?.code ?? "",
        balance: b.balance.balance,
        used: b.balance.used,
        year: b.balance.year,
      }));

    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
