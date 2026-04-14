import { db } from "@workspace/db";
import { attendanceRecordsTable, employeesTable } from "@workspace/db";
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
      return Response.json({ error: "Already clocked in today" }, { status: 400 });
    }

    const clockIn = new Date();
    const isLate = clockIn.getHours() > 9 || (clockIn.getHours() === 9 && clockIn.getMinutes() > 30);
    // If clocking in after 13:00 it counts as a half-day
    const isHalfDay = clockIn.getHours() >= 13;
    const recId = crypto.randomUUID();
    await db.insert(attendanceRecordsTable).values({ id: recId, employeeId, date: today, clockIn, type: "wfo", isLate, isHalfDay, notes });
    const [record] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, recId));
    if (isLate) {
      fireAutomationEvent({ event: "attendance.late_arrival", employeeId, variables: { date: today } }).catch(console.error);
    }
    return Response.json(record, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
