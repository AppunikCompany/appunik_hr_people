import { db } from "@workspace/db";
import {
  leaveRequestsTable,
  leaveTypesTable,
  leaveBalancesTable,
  leavePoliciesTable,
  employeesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { resolveEmployeeId } from "@/lib/ownership";
import { fireAutomationEvent } from "@/lib/automations";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const managerId = searchParams.get("managerId") ?? undefined;

    const requests = await db
      .select({
        req: leaveRequestsTable,
        emp: employeesTable,
        lt: leaveTypesTable,
      })
      .from(leaveRequestsTable)
      .leftJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
      .leftJoin(leaveTypesTable, eq(leaveRequestsTable.leaveTypeId, leaveTypesTable.id));

    let filtered = requests;
    if (employeeId) filtered = filtered.filter((r) => r.req.employeeId === employeeId);
    if (status) filtered = filtered.filter((r) => r.req.status === status);
    if (managerId) {
      filtered = filtered.filter((r) => r.emp?.reportingManagerId === managerId);
    }

    const result = filtered.map((r) => ({
      ...r.req,
      employeeName: r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : "",
      leaveTypeName: r.lt?.name ?? "",
      approvedByName: null,
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

    const { employeeId: clientId, leaveTypeId, startDate, endDate, reason } = await request.json() as {
      employeeId?: string;
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      reason: string;
    };

    const result = await resolveEmployeeId(user, clientId);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    const employeeId = result.id;

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, leaveTypeId));

    // ── LV-09: Enforce leave policy rules ──
    const [policy] = await db.select().from(leavePoliciesTable).where(eq(leavePoliciesTable.leaveTypeId, leaveTypeId));
    if (policy) {
      // No leave during probation
      if (policy.noLeaveInProbation && emp?.probationEndDate) {
        const probEnd = new Date(emp.probationEndDate);
        if (new Date() < probEnd) {
          return Response.json({ error: `${lt?.name ?? "This leave type"} cannot be taken during probation period` }, { status: 400 });
        }
      }
      // Minimum notice days
      if (policy.minNoticeDays && policy.minNoticeDays > 0) {
        const daysUntilStart = Math.ceil((new Date(startDate).getTime() - Date.now()) / 86400000);
        if (daysUntilStart < policy.minNoticeDays) {
          return Response.json({ error: `${lt?.name ?? "This leave type"} requires at least ${policy.minNoticeDays} days advance notice` }, { status: 400 });
        }
      }
      // Max consecutive days
      if (policy.maxConsecutiveDays) {
        const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
        if (days > policy.maxConsecutiveDays) {
          return Response.json({ error: `${lt?.name ?? "This leave type"} allows max ${policy.maxConsecutiveDays} consecutive days` }, { status: 400 });
        }
      }
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

    // ── LV-05: Auto-detect LOP when balance is exhausted ──
    const year = new Date().getFullYear();
    const [bal] = await db.select().from(leaveBalancesTable)
      .where(and(eq(leaveBalancesTable.employeeId, employeeId), eq(leaveBalancesTable.leaveTypeId, leaveTypeId), eq(leaveBalancesTable.year, year)));
    const isLop = !bal || (bal.balance - bal.used) < days;
    const effectiveStatus = isLop ? "lop" : "pending";

    const lrId = crypto.randomUUID();
    await db.insert(leaveRequestsTable).values({ id: lrId, employeeId, leaveTypeId, startDate, endDate, days, reason, status: effectiveStatus });
    const [req] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, lrId));

    fireAutomationEvent({
      event: "leave.applied",
      employeeId,
      variables: { leaveType: lt?.name ?? "", startDate, endDate, days: String(days), reason, isLop: String(isLop) },
    }).catch(console.error);

    return Response.json({
      ...req,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
      leaveTypeName: lt?.name ?? "",
      approvedByName: null,
      isLop,
    }, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
