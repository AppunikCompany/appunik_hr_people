import { db } from "@workspace/db";
import { attendanceRecordsTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "manager"])) return forbidden();

    const records = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.type, "wfh_pending"));
    const employees = await db.select().from(employeesTable);
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const result = records.map((r) => {
      const emp = empMap.get(r.employeeId);
      return { ...r, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "", department: null };
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
