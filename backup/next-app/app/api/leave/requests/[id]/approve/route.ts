import { db } from "@workspace/db";
import {
  leaveRequestsTable,
  leaveTypesTable,
  leaveBalancesTable,
  employeesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";
import { fireAutomationEvent } from "@/lib/automations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "manager"])) return forbidden();

    const { id } = await params;
    const { comment } = await request.json() as { comment?: string };

    await db.update(leaveRequestsTable).set({ status: "approved", managerComment: comment }).where(eq(leaveRequestsTable.id, id));
    const [leaveRequest] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, id));

    if (!leaveRequest) return Response.json({ error: "Not found" }, { status: 404 });

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, leaveRequest.employeeId));
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, leaveRequest.leaveTypeId));

    const year = new Date().getFullYear();
    const [bal] = await db
      .select()
      .from(leaveBalancesTable)
      .where(
        and(
          eq(leaveBalancesTable.employeeId, leaveRequest.employeeId),
          eq(leaveBalancesTable.leaveTypeId, leaveRequest.leaveTypeId),
          eq(leaveBalancesTable.year, year)
        )
      );
    if (bal) {
      const newBalance = Math.max(0, bal.balance - leaveRequest.days);
      await db
        .update(leaveBalancesTable)
        .set({ used: bal.used + leaveRequest.days, balance: newBalance })
        .where(eq(leaveBalancesTable.id, bal.id));
      if (newBalance <= 2) {
        fireAutomationEvent({
          event: "leave.balance_low",
          employeeId: leaveRequest.employeeId,
          variables: { leaveType: lt?.name ?? "", balance: String(newBalance) },
        }).catch(console.error);
      }
    }

    fireAutomationEvent({
      event: "leave.approved",
      employeeId: leaveRequest.employeeId,
      variables: { leaveType: lt?.name ?? "", startDate: leaveRequest.startDate, endDate: leaveRequest.endDate, days: String(leaveRequest.days) },
    }).catch(console.error);

    return Response.json({
      ...leaveRequest,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
      leaveTypeName: lt?.name ?? "",
      approvedByName: null,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
