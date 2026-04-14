import { db } from "@workspace/db";
import { attendanceRecordsTable, employeesTable, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "manager"])) return forbidden();

    const today = new Date().toISOString().split("T")[0];
    let employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));

    // Manager: restrict to their direct reports
    if (user.role === "manager") {
      const [managerEmp] = await db.select().from(employeesTable).where(eq(employeesTable.userId, user.id));
      if (managerEmp) {
        employees = employees.filter((e) => e.reportingManagerId === managerEmp.id);
      } else {
        employees = [];
      }
    }

    const records = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.date, today));
    const recordMap = new Map(records.map((r) => [r.employeeId, r]));

    const result = await Promise.all(
      employees.map(async (emp) => {
        const rec = recordMap.get(emp.id);
        let dept = null;
        if (emp.departmentId) {
          const [d] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId));
          dept = d?.name ?? null;
        }
        return {
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          department: dept,
          status: rec ? rec.type : "absent",
          clockIn: rec?.clockIn?.toISOString() ?? null,
          type: rec?.type ?? null,
        };
      })
    );
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
