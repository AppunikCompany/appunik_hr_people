import { db } from "@workspace/db";
import { employeesTable, departmentsTable, designationsTable } from "@workspace/db";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

function escapeCSV(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const employees = await db.select().from(employeesTable);
    const depts = await db.select().from(departmentsTable);
    const desigs = await db.select().from(designationsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const desigMap = new Map(desigs.map((d) => [d.id, d.name]));

    const headers = [
      "Employee Code", "First Name", "Last Name", "Email", "Phone",
      "Department", "Designation", "Employment Type", "Status",
      "Joining Date", "Gender", "Date of Birth",
    ];

    const rows = employees.map((e) => [
      e.employeeCode,
      e.firstName,
      e.lastName,
      e.email,
      e.phone ?? "",
      e.departmentId ? (deptMap.get(e.departmentId) ?? "") : "",
      e.designationId ? (desigMap.get(e.designationId) ?? "") : "",
      e.employmentType,
      e.status,
      e.joiningDate,
      e.gender ?? "",
      e.dateOfBirth ?? "",
    ].map(escapeCSV).join(","));

    const csv = [headers.join(","), ...rows].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=employees.csv",
      },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
