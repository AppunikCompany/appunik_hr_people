import { db } from "@workspace/db";
import { attendanceRecordsTable, employeesTable, appConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { resolveEmployeeId } from "@/lib/ownership";
import { fireAutomationEvent } from "@/lib/automations";

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { employeeId: clientId, notes } = await request.json() as { employeeId?: string; notes?: string };
    const result = await resolveEmployeeId(user, clientId);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    const employeeId = result.id;

    const today = new Date().toISOString().split("T")[0];
    const existing = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));

    if (existing.length > 0) {
      return Response.json({ error: "Already marked attendance today" }, { status: 400 });
    }

    // WFH cutoff: cannot mark WFH at or after 10:00 AM
    const now = new Date();
    if (now.getHours() >= 10) {
      return Response.json({ error: "WFH can only be marked before 10:00 AM" }, { status: 400 });
    }

    // AU-19: Check if WFH requires manager approval
    const [wfhCfg] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, "wfh_requires_approval"));
    const needsApproval = wfhCfg?.value === "true";

    const wfhId = crypto.randomUUID();
    const wfhType = needsApproval ? "wfh_pending" : "wfh";
    await db.insert(attendanceRecordsTable).values({ id: wfhId, employeeId, date: today, type: wfhType, isLate: false, isHalfDay: false, notes });
    const [record] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, wfhId));

    if (needsApproval) {
      // Notify manager
      const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
      if (emp?.reportingManagerId) {
        fireAutomationEvent({ event: "employee.created", employeeId, variables: { eventType: "wfh_approval_request", date: today } }).catch(console.error);
      }
    }

    return Response.json({ ...record, needsApproval }, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
