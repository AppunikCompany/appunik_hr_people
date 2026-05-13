import { db } from "@workspace/db";
import { attendanceRecordsTable } from "@workspace/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") ?? "";
    const year = searchParams.get("year") ?? "";
    const employeeId = searchParams.get("employeeId") ?? undefined;

    const all = await db.select().from(attendanceRecordsTable);
    const filtered = all.filter((r) => {
      const d = new Date(r.date);
      const matchMonth = d.getMonth() + 1 === parseInt(month);
      const matchYear = d.getFullYear() === parseInt(year);
      const matchEmp = employeeId ? r.employeeId === employeeId : true;
      return matchMonth && matchYear && matchEmp;
    });
    return Response.json(filtered);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
