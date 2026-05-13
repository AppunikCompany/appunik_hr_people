import { db } from "@workspace/db";
import { attendanceRecordsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { employeeId, date, type, clockIn, clockOut, notes } = await request.json() as {
      employeeId: string; date: string; type: string; clockIn?: string; clockOut?: string; notes?: string;
    };

    const existing = await db.select().from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, date)));

    if (existing.length > 0) {
      await db.update(attendanceRecordsTable)
        .set({ type, clockIn: clockIn ? new Date(clockIn) : null, clockOut: clockOut ? new Date(clockOut) : null, notes: notes ?? null })
        .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, date)));
      const [updated] = await db.select().from(attendanceRecordsTable)
        .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, date)));
      return Response.json(updated);
    } else {
      const id = crypto.randomUUID();
      await db.insert(attendanceRecordsTable).values({
        id, employeeId, date, type,
        clockIn: clockIn ? new Date(clockIn) : null,
        clockOut: clockOut ? new Date(clockOut) : null,
        isLate: false, isHalfDay: false, notes: notes ?? null,
      });
      const [record] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, id));
      return Response.json(record, { status: 201 });
    }
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
