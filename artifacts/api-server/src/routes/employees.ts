import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  employeesTable,
  employeeDocumentsTable,
  employeeHistoryTable,
  departmentsTable,
  designationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { fireAutomationEvent } from "../lib/automations";

const router: IRouter = Router();

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

async function enrichEmployee(emp: typeof employeesTable.$inferSelect) {
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

router.get("/employees", requireAuth, async (req, res) => {
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

router.post("/employees", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
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

router.get("/employees/:id", requireAuth, async (req, res) => {
  try {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, (req.params.id as string)));
    if (!emp) { res.status(404).json({ error: "Not found" }); return; }
    res.json(await enrichEmployee(emp));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/employees/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const [emp] = await db
      .update(employeesTable)
      .set(req.body)
      .where(eq(employeesTable.id, (req.params.id as string)))
      .returning();
    if (!emp) { res.status(404).json({ error: "Not found" }); return; }
    res.json(await enrichEmployee(emp));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/employees/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.delete(employeesTable).where(eq(employeesTable.id, (req.params.id as string)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/employees/:id/documents", requireAuth, async (req, res) => {
  try {
    const docs = await db.select().from(employeeDocumentsTable).where(eq(employeeDocumentsTable.employeeId, (req.params.id as string)));
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/employees/:id/documents", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
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

router.get("/employees/:id/history", requireAuth, async (req, res) => {
  try {
    const history = await db.select().from(employeeHistoryTable).where(eq(employeeHistoryTable.employeeId, (req.params.id as string)));
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/employees/:id/history", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
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

router.get("/org-chart", requireAuth, async (_req, res) => {
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
