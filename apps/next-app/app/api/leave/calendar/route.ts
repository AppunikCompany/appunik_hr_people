import { db } from "@workspace/db";
import { leaveRequestsTable, leaveTypesTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") ?? "";
    const year = searchParams.get("year") ?? "";

    const requests = await db
      .select({
        req: leaveRequestsTable,
        emp: employeesTable,
        lt: leaveTypesTable,
      })
      .from(leaveRequestsTable)
      .leftJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
      .leftJoin(leaveTypesTable, eq(leaveRequestsTable.leaveTypeId, leaveTypesTable.id));

    const m = parseInt(month);
    const y = parseInt(year);

    const result = requests
      .filter((r) => {
        const d = new Date(r.req.startDate);
        return d.getMonth() + 1 === m && d.getFullYear() === y;
      })
      .map((r) => ({
        employeeId: r.req.employeeId,
        employeeName: r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : "",
        leaveType: r.lt?.name ?? "",
        startDate: r.req.startDate,
        endDate: r.req.endDate,
        days: r.req.days,
        status: r.req.status,
      }));

    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
