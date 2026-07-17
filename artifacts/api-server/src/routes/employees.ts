import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  employeesTable,
  employeeDocumentsTable,
  employeeHistoryTable,
  employeeExperienceTable,
  employeeEducationTable,
  exitRequestsTable,
  departmentsTable,
  designationsTable,
  leaveBalancesTable,
  leaveTypesTable,
} from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { fireAutomationEvent } from "../lib/automations";
import { PRIVILEGED_ROLES, canReadEmployee } from "../lib/ownership";
import { notifyAllEmployees } from "../lib/notify";

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
    const user = req.user;

    let employees = await db.select().from(employeesTable);

    // Non-privileged employees can only see their own record
    if (!PRIVILEGED_ROLES.has(user?.role ?? "")) {
      const [self] = await db.select().from(employeesTable).where(eq(employeesTable.userId, user?.id ?? ""));
      res.json(self ? await Promise.all([enrichEmployee(self)]) : []);
      return;
    }

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

router.get("/employees/export", requireAuth, requireRole("super_admin", "hr_admin"), async (_req, res): Promise<void> => {
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

    res.json({ created, errors, results });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/employees", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const { firstName, lastName, email, reportingManagerId } = req.body as {
      firstName?: string; lastName?: string; email?: string; reportingManagerId?: string;
    };

    if (!firstName || !lastName || !email) {
      res.status(400).json({ error: "First Name, Last Name, and Email are required" });
      return;
    }

    const [existingEmail] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.email, email));
    if (existingEmail) {
      res.status(409).json({ error: "An employee with this email already exists" });
      return;
    }

    if (reportingManagerId) {
      const [manager] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.id, reportingManagerId));
      if (!manager) {
        res.status(400).json({ error: "Reporting manager not found" });
        return;
      }
    }

    const code = await nextEmployeeCode();
    const newEmpId = crypto.randomUUID();
    await db.insert(employeesTable).values({ ...req.body, id: newEmpId, employeeCode: code });
    const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, newEmpId));
    const enriched = await enrichEmployee(employee);

    fireAutomationEvent({ event: "employee.created", employeeId: employee.id }).catch(console.error);

    notifyAllEmployees({
      type: "employee.joined",
      title: `Welcome ${employee.firstName} ${employee.lastName}! 👋`,
      body: `${employee.firstName} ${employee.lastName} has joined the team. Say hello!`,
      link: "/employees",
    }).catch(console.error);

    res.status(201).json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const empId = req.params.id as string;
    if (!(await canReadEmployee(req, res, empId))) return;
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, empId));
    if (!emp) { res.status(404).json({ error: "Not found" }); return; }
    res.json(await enrichEmployee(emp));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/employees/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const empId = req.params.id as string;
    const [before] = await db.select().from(employeesTable).where(eq(employeesTable.id, empId));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    // Validate Employee Code: if changed by HR/Super Admin, must be unique across the table
    const body = req.body as Record<string, unknown>;
    if (typeof body.employeeCode === "string") {
      const newCode = body.employeeCode.trim().toUpperCase();
      if (!newCode) { res.status(400).json({ error: "Employee Code cannot be empty" }); return; }
      if (newCode !== before.employeeCode) {
        const [conflict] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.employeeCode, newCode));
        if (conflict && conflict.id !== empId) {
          res.status(409).json({ error: `Employee Code "${newCode}" is already in use by another employee` });
          return;
        }
        body.employeeCode = newCode;
      } else {
        delete body.employeeCode;
      }
    }

    if (Object.keys(body).length > 0) {
      await db.update(employeesTable).set(body).where(eq(employeesTable.id, empId));
    }
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, empId));

    // AM-10: When employee moves to notice/resigned/terminated, fire offboarding + asset return event
    if (before && before.status === "active" && (emp.status === "resigned" || emp.status === "terminated" || emp.status === "notice")) {
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
    const { id } = req.params as { id: string };
    const { documentType, fileName, fileUrl, expiryDate } = req.body as {
      documentType: string; fileName: string; fileUrl: string; expiryDate?: string;
    };
    if (!documentType || !fileName || !fileUrl) {
      res.status(400).json({ error: "documentType, fileName, and fileUrl are required" });
      return;
    }
    const docId = crypto.randomUUID();
    await db.insert(employeeDocumentsTable).values({
      id: docId, employeeId: id, documentType, fileName, fileUrl,
      expiryDate: expiryDate || null,
    });
    const [doc] = await db.select().from(employeeDocumentsTable).where(eq(employeeDocumentsTable.id, docId));
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
    const histId = crypto.randomUUID();
    await db.insert(employeeHistoryTable).values({ ...req.body, id: histId, employeeId: (req.params.id as string) });
    const [entry] = await db.select().from(employeeHistoryTable).where(eq(employeeHistoryTable.id, histId));
    res.status(201).json(entry);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/employees/:id/experience", requireAuth, async (req, res): Promise<void> => {
  try {
    if (!(await canReadEmployee(req, res, req.params.id as string))) return;
    const rows = await db.select().from(employeeExperienceTable).where(eq(employeeExperienceTable.employeeId, req.params.id as string));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/employees/:id/education", requireAuth, async (req, res): Promise<void> => {
  try {
    if (!(await canReadEmployee(req, res, req.params.id as string))) return;
    const rows = await db.select().from(employeeEducationTable).where(eq(employeeEducationTable.employeeId, req.params.id as string));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/employees/:id/education", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { institution, degree, fieldOfStudy, startYear, endYear, grade, certificateUrl } = req.body as {
      institution?: string; degree?: string; fieldOfStudy?: string; startYear?: string; endYear?: string | null; grade?: string | null; certificateUrl?: string | null;
    };
    if (!institution?.trim() || !degree?.trim() || !startYear?.trim()) {
      res.status(400).json({ error: "Institution, degree and start year are required" });
      return;
    }
    const eduId = crypto.randomUUID();
    await db.insert(employeeEducationTable).values({
      id: eduId, employeeId: id,
      institution: institution.trim(), degree: degree.trim(),
      fieldOfStudy: fieldOfStudy?.trim() ?? null,
      startYear: startYear.trim(),
      endYear: endYear?.trim() ?? null,
      grade: grade?.trim() ?? null,
      certificateUrl: certificateUrl?.trim() ?? null,
    });
    const [row] = await db.select().from(employeeEducationTable).where(eq(employeeEducationTable.id, eduId));
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/employees/:id/education/:eduId", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const { id, eduId } = req.params as { id: string; eduId: string };
    const updates = req.body as Record<string, string | null>;
    const sanitize = (v: unknown) => (typeof v === "string" ? v.trim() || null : v ?? null);
    const patch: Record<string, unknown> = {};
    for (const k of ["institution", "degree", "fieldOfStudy", "startYear", "endYear", "grade", "certificateUrl"]) {
      if (k in updates) patch[k] = sanitize(updates[k]);
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "No editable fields supplied" });
      return;
    }
    await db.update(employeeEducationTable).set(patch).where(and(
      eq(employeeEducationTable.id, eduId),
      eq(employeeEducationTable.employeeId, id),
    ));
    const [row] = await db.select().from(employeeEducationTable).where(eq(employeeEducationTable.id, eduId));
    if (!row) { res.status(404).json({ error: "Education entry not found" }); return; }
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/employees/:id/education/:eduId", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const { id, eduId } = req.params as { id: string; eduId: string };
    await db.delete(employeeEducationTable).where(and(
      eq(employeeEducationTable.id, eduId),
      eq(employeeEducationTable.employeeId, id),
    ));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/employees/:id/exit", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const [row] = await db.select().from(exitRequestsTable).where(eq(exitRequestsTable.employeeId, req.params.id as string));
    res.json(row ?? null);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// HR-only: create an exit interview record for an employee (allowed without a separate offboarding initiation)
router.post("/employees/:id/exit", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { resignationDate, lastWorkingDay, reason, status, managerComment, exitInterviewNotes } = req.body as {
      resignationDate?: string; lastWorkingDay?: string;
      reason?: string; status?: string;
      managerComment?: string; exitInterviewNotes?: string;
    };
    if (!resignationDate?.trim() || !lastWorkingDay?.trim()) {
      res.status(400).json({ error: "Resignation date and last working day are required" });
      return;
    }
    const [existing] = await db.select().from(exitRequestsTable).where(eq(exitRequestsTable.employeeId, id));
    if (existing) {
      res.status(409).json({ error: "An exit interview already exists for this employee" });
      return;
    }
    const exitId = crypto.randomUUID();
    await db.insert(exitRequestsTable).values({
      id: exitId, employeeId: id,
      resignationDate: resignationDate.trim(),
      lastWorkingDay: lastWorkingDay.trim(),
      reason: reason?.trim() ?? null,
      status: status?.trim() ?? "approved",
      managerComment: managerComment?.trim() ?? null,
      exitInterviewNotes: exitInterviewNotes?.trim() ?? null,
    });
    const [row] = await db.select().from(exitRequestsTable).where(eq(exitRequestsTable.id, exitId));
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// HR-only: edit the exit interview record (notes, reason, status update, etc.)
router.patch("/employees/:id/exit", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const updates = req.body as Record<string, string | null>;
    const patch: Record<string, unknown> = {};
    for (const k of ["resignationDate", "lastWorkingDay", "reason", "status", "managerComment", "exitInterviewNotes"]) {
      if (k in updates) {
        const v = updates[k];
        patch[k] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v ?? null;
      }
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "No editable fields supplied" });
      return;
    }
    const [existing] = await db.select().from(exitRequestsTable).where(eq(exitRequestsTable.employeeId, id));
    if (!existing) {
      res.status(404).json({ error: "No exit interview on record. Use POST to create one." });
      return;
    }
    await db.update(exitRequestsTable).set(patch).where(eq(exitRequestsTable.employeeId, id));
    const [row] = await db.select().from(exitRequestsTable).where(eq(exitRequestsTable.employeeId, id));
    res.json(row);
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
