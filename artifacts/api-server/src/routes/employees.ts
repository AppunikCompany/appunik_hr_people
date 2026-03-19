import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  employeesTable,
  employeeDocumentsTable,
  employeeHistoryTable,
  departmentsTable,
  designationsTable,
  leaveBalancesTable,
  leaveTypesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { fireAutomationEvent } from "../lib/automations";

const router: IRouter = Router();

type Employee = typeof employeesTable.$inferSelect;

function toEmployeeCode(n: number): string {
  return `EMP-${String(n).padStart(3, "0")}`;
}

async function nextEmployeeCode(): Promise<string> {
  const all = await db.select({ code: employeesTable.employeeCode }).from(employeesTable);
  const nums = all
    .map((e) => parseInt(e.code.replace("EMP-", ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return toEmployeeCode(next);
}

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

function escapeCSV(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

router.get("/employees", requireAuth, async (req, res): Promise<void> => {
  try {
    const { search, department, status } = req.query as Record<string, string>;
    let employees = await db.select().from(employeesTable);

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
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/employees/export", requireAuth, async (_req, res): Promise<void> => {
  try {
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
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=employees.csv");
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/employees/import", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const { rows } = req.body as { rows: Record<string, string>[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "No rows provided" });
      return;
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
        const [employee] = await db
          .insert(employeesTable)
          .values({
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
          })
          .returning();

        for (const lt of leaveTypes) {
          await db.insert(leaveBalancesTable).values({
            employeeId: employee.id,
            leaveTypeId: lt.id,
            year: new Date().getFullYear(),
            allocated: lt.defaultDays,
            used: 0,
            pending: 0,
          }).onConflictDoNothing();
        }

        fireAutomationEvent({ event: "employee.created", employeeId: employee.id }).catch(console.error);

        results.push({ row: i + 1, status: "created", employeeCode: code });
        created++;
      } catch (rowErr) {
        results.push({ row: i + 1, status: "error", error: String(rowErr) });
        errors++;
      }
    }

    res.json({ created, errors, results });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/employees", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const code = await nextEmployeeCode();
    const [employee] = await db
      .insert(employeesTable)
      .values({ ...req.body, employeeCode: code })
      .returning();
    const enriched = await enrichEmployee(employee);

    fireAutomationEvent({ event: "employee.created", employeeId: employee.id }).catch(console.error);

    res.status(201).json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, (req.params.id as string)));
    if (!emp) { res.status(404).json({ error: "Not found" }); return; }
    res.json(await enrichEmployee(emp));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/employees/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const [before] = await db.select().from(employeesTable).where(eq(employeesTable.id, (req.params.id as string)));
    const [emp] = await db
      .update(employeesTable)
      .set(req.body)
      .where(eq(employeesTable.id, (req.params.id as string)))
      .returning();
    if (!emp) { res.status(404).json({ error: "Not found" }); return; }

    if (before && before.status === "active" && (emp.status === "resigned" || emp.status === "terminated")) {
      fireAutomationEvent({ event: "employee.offboarding_started", employeeId: emp.id }).catch(console.error);
    }

    res.json(await enrichEmployee(emp));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/employees/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    await db.delete(employeesTable).where(eq(employeesTable.id, (req.params.id as string)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/employees/:id/documents", requireAuth, async (req, res): Promise<void> => {
  try {
    const docs = await db.select().from(employeeDocumentsTable).where(eq(employeeDocumentsTable.employeeId, (req.params.id as string)));
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/employees/:id/documents", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const [doc] = await db
      .insert(employeeDocumentsTable)
      .values({ ...req.body, employeeId: (req.params.id as string) })
      .returning();
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/employees/:id/history", requireAuth, async (req, res): Promise<void> => {
  try {
    const history = await db.select().from(employeeHistoryTable).where(eq(employeeHistoryTable.employeeId, (req.params.id as string)));
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/employees/:id/history", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const [entry] = await db
      .insert(employeeHistoryTable)
      .values({ ...req.body, employeeId: (req.params.id as string) })
      .returning();
    res.status(201).json(entry);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/org-chart", requireAuth, async (_req, res): Promise<void> => {
  try {
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    const enriched = await Promise.all(employees.map(enrichEmployee));
    const nodes = enriched.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      designation: e.designationName,
      department: e.departmentName,
      reportingManagerId: e.reportingManagerId,
    }));
    res.json(nodes);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
