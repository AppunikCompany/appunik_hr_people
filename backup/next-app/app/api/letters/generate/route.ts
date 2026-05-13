import { db } from "@workspace/db";
import { letterTemplatesTable, generatedLettersTable, employeesTable, departmentsTable, designationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

function fillTemplate(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { employeeId, templateId, extraVars } = await request.json() as { employeeId: string; templateId: string; extraVars?: Record<string, string> };

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    if (!emp) return Response.json({ error: "Employee not found" }, { status: 404 });

    const [tmpl] = await db.select().from(letterTemplatesTable).where(eq(letterTemplatesTable.id, templateId));
    if (!tmpl) return Response.json({ error: "Template not found" }, { status: 404 });

    let deptName = "";
    if (emp.departmentId) {
      const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId));
      deptName = dept?.name ?? "";
    }
    let desigName = "";
    if (emp.designationId) {
      const [desig] = await db.select().from(designationsTable).where(eq(designationsTable.id, emp.designationId));
      desigName = desig?.name ?? "";
    }

    const today = new Date();
    const vars: Record<string, string> = {
      fullName: `${emp.firstName} ${emp.lastName}`,
      firstName: emp.firstName,
      lastName: emp.lastName,
      employeeCode: emp.employeeCode,
      designation: desigName,
      department: deptName,
      joiningDate: emp.joiningDate ?? "",
      lastWorkingDay: emp.lastWorkingDay ?? "",
      currentDate: today.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      companyName: "Your Company",
      ...(extraVars ?? {}),
    };

    const generatedHtml = fillTemplate(tmpl.bodyHtml, vars);
    const id = crypto.randomUUID();
    await db.insert(generatedLettersTable).values({ id, employeeId, templateId, templateName: tmpl.name, generatedHtml });
    const [letter] = await db.select().from(generatedLettersTable).where(eq(generatedLettersTable.id, id));
    return Response.json({ ...letter, employeeName: `${emp.firstName} ${emp.lastName}` }, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
