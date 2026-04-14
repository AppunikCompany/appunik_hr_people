import { db } from "@workspace/db";
import { attendanceRecordsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { resolveEmployeeId } from "@/lib/ownership";

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { employeeId: clientId, notes } = await request.json() as { employeeId?: string; notes?: string };
    const result = await resolveEmployeeId(user, clientId);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    const employeeId = result.id;

    const today = new Date().toISOString().split("T")[0];
    const [existing] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));

    if (!existing) return Response.json({ error: "No clock-in found for today" }, { status: 404 });

    const clockOut = new Date();
    const hoursWorked = existing.clockIn
      ? (clockOut.getTime() - new Date(existing.clockIn).getTime()) / 3600000
      : null;
    // Mark half-day if hours worked < 4 (and not already a half-day from late clock-in)
    const isHalfDay = existing.isHalfDay || (hoursWorked !== null && hoursWorked < 4);

    await db.update(attendanceRecordsTable).set({ clockOut, hoursWorked, isHalfDay, notes: notes ?? existing.notes }).where(eq(attendanceRecordsTable.id, existing.id));
    const [record] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, existing.id));
    return Response.json(record);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
