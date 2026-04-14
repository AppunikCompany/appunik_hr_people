import { db } from "@workspace/db";
import {
  employeesTable,
  departmentsTable,
  designationsTable,
  leaveBalancesTable,
  leaveTypesTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";
import { fireAutomationEvent } from "@/lib/automations";

async function nextEmployeeCode(): Promise<string> {
  const all = await db.select({ code: employeesTable.employeeCode }).from(employeesTable);
  const nums = all
    .map((e) => parseInt(e.code.replace("EMP-", ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `EMP-${String(next).padStart(3, "0")}`;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { rows } = await request.json() as { rows: Record<string, string>[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: "No rows provided" }, { status: 400 });
    }

    const depts = await db.select().from(departmentsTable);
    const desigs = await db.select().from(designationsTable);
    const deptByName = new Map(depts.map((d) => [d.name.toLowerCase(), d.id]));
    const desigByName = new Map(desigs.map((d) => [d.name.toLowerCase(), d.id]));
    const leaveTypes = await db.select().from(leaveTypesTable);

    const results: Array<{ row: number; status: "created" | "error"; error?: string; employeeCode?: string }> = [];
    let created = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const firstName = row["First Name"]?.trim();
        const lastName = row["Last Name"]?.trim();
        const email = row["Email"]?.trim();

        if (!firstName || !lastName || !email) {
          results.push({ row: i + 1, status: "error", error: "First Name, Last Name, and Email are required" });
          errors++;
          continue;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          results.push({ row: i + 1, status: "error", error: "Invalid email format" });
          errors++;
          continue;
        }

        const deptId = row["Department"] ? (deptByName.get(row["Department"].toLowerCase()) ?? null) : null;
        const desigId = row["Designation"] ? (desigByName.get(row["Designation"].toLowerCase()) ?? null) : null;

        const validTypes = ["full_time", "part_time", "contract", "intern"];
        const employmentType = validTypes.includes(row["Employment Type"]?.toLowerCase())
          ? row["Employment Type"].toLowerCase()
          : "full_time";

        const joiningDate = row["Joining Date"] || new Date().toISOString().split("T")[0];

        const code = await nextEmployeeCode();
        const empId = crypto.randomUUID();
        await db.insert(employeesTable).values({
          id: empId,
          employeeCode: code,
          firstName,
          lastName,
          email,
          phone: row["Phone"] ?? null,
          departmentId: deptId,
          designationId: desigId,
          employmentType,
          joiningDate,
          gender: row["Gender"] ?? null,
          dateOfBirth: row["Date of Birth"] ?? null,
          status: "active",
        });
        const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, empId));

        for (const lt of leaveTypes) {
          const balId = crypto.randomUUID();
          await db.insert(leaveBalancesTable).values({
            id: balId,
            employeeId: employee.id,
            leaveTypeId: lt.id,
            year: new Date().getFullYear(),
            balance: lt.maxDaysPerYear,
            used: 0,
          }).onDuplicateKeyUpdate({ set: { id: sql`id` } });
        }

        fireAutomationEvent({ event: "employee.created", employeeId: employee.id }).catch(console.error);

        results.push({ row: i + 1, status: "created", employeeCode: code });
        created++;
      } catch (rowErr) {
        results.push({ row: i + 1, status: "error", error: String(rowErr) });
        errors++;
      }
    }

    return Response.json({ created, errors, results });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
