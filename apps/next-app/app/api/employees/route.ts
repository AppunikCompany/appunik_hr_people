import { db } from "@workspace/db";
import {
  employeesTable,
  departmentsTable,
  designationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

type Employee = typeof employeesTable.$inferSelect;

async function enrichEmployee(emp: Employee) {
  let departmentName: string | null = null;
  let designationName: string | null = null;
  let reportingManagerName: string | null = null;

  if (emp.departmentId) {
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId));
    departmentName = dept?.name ?? null;
  }
  if (emp.designationId) {
    const [desig] = await db.select().from(designationsTable).where(eq(designationsTable.id, emp.designationId));
    designationName = desig?.name ?? null;
  }
  if (emp.reportingManagerId) {
    const [mgr] = await db.select().from(employeesTable).where(eq(employeesTable.id, emp.reportingManagerId));
    reportingManagerName = mgr ? `${mgr.firstName} ${mgr.lastName}` : null;
  }

  return { ...emp, departmentName, designationName, reportingManagerName };
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const department = searchParams.get("department") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const role = user.role ?? "";

    let employees = await db.select().from(employeesTable);

    // Employee: own record only
    if (role === "employee") {
      const [self] = await db.select().from(employeesTable).where(eq(employeesTable.userId, user.id));
      return Response.json(self ? [await enrichEmployee(self)] : []);
    }

    // Manager: their direct reports only
    if (role === "manager") {
      const [managerEmp] = await db.select().from(employeesTable).where(eq(employeesTable.userId, user.id));
      if (!managerEmp) return Response.json([]);
      employees = employees.filter((e) => e.reportingManagerId === managerEmp.id);
    }

    // it_admin, hr_admin, super_admin: all employees (fall through with no extra filter)

    if (status) employees = employees.filter((e) => e.status === status);
    if (department) employees = employees.filter((e) => e.departmentId === department);

    if (search) {
      const q = search.toLowerCase();
      employees = employees.filter(
        (e) =>
          e.firstName.toLowerCase().includes(q) ||
          e.lastName.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q)
      );
    }

    const enriched = await Promise.all(employees.map(enrichEmployee));
    return Response.json(enriched);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

