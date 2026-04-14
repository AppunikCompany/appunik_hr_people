import { db } from "@workspace/db";
import { attendanceRecordsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuthUser, unauthorized, isPrivileged } from "@/lib/auth";
import { resolveEmployeeId } from "@/lib/ownership";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("employeeId") ?? undefined;

    let employeeId: string | null = null;
    if (isPrivileged(user)) {
      employeeId = clientId ?? "";
    } else {
      const result = await resolveEmployeeId(user, clientId);
      if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
      employeeId = result.id;
    }

    const today = new Date().toISOString().split("T")[0];
    const [record] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, today)));
    return Response.json(record ?? null);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
