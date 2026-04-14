import { db } from "@workspace/db";
import { attendanceRecordsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "manager"])) return forbidden();

    const { id: recordId } = await params;
    const { approved } = await request.json() as { approved: boolean };

    const [record] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, recordId));
    if (!record) return Response.json({ error: "Record not found" }, { status: 404 });
    if (record.type !== "wfh_pending") return Response.json({ error: "Record is not pending WFH approval" }, { status: 400 });

    if (approved) {
      await db.update(attendanceRecordsTable).set({ type: "wfh" }).where(eq(attendanceRecordsTable.id, recordId));
    } else {
      await db.delete(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, recordId));
    }

    const [updated] = approved
      ? await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, recordId))
      : [null];
    return Response.json({ approved, record: updated });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
