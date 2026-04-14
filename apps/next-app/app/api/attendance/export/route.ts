import { db } from "@workspace/db";
import { attendanceRecordsTable, employeesTable, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") ?? "";
    const year = searchParams.get("year") ?? "";
    const m = parseInt(month);
    const y = parseInt(year);
    if (!m || !y) return Response.json({ error: "month and year are required" }, { status: 400 });

    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    const allRecords = await db.select().from(attendanceRecordsTable);
    const depts = await db.select().from(departmentsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));

    const filtered = allRecords.filter((r) => {
      const d = new Date(r.date);
      return d.getMonth() + 1 === m && d.getFullYear() === y;
    });

    const headers = ["Employee Code", "Name", "Department", "Date", "Type", "Clock In", "Clock Out", "Hours Worked", "Late", "Half Day"];
    const rows = filtered.map((r) => {
      const emp = employees.find((e) => e.id === r.employeeId);
      return [
        emp?.employeeCode ?? "",
        emp ? `${emp.firstName} ${emp.lastName}` : "",
        emp?.departmentId ? (deptMap.get(emp.departmentId) ?? "") : "",
        r.date,
        r.type,
        r.clockIn?.toISOString() ?? "",
        r.clockOut?.toISOString() ?? "",
        r.hoursWorked?.toFixed(1) ?? "",
        r.isLate ? "Yes" : "No",
        r.isHalfDay ? "Yes" : "No",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    });

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=attendance_${y}_${m}.csv`,
      },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
