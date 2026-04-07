import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { letterTemplatesTable, generatedLettersTable, employeesTable, departmentsTable, designationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";

const router: IRouter = Router();

const SEED_TEMPLATES = [
  {
    code: "offer_letter",
    name: "Offer Letter",
    variables: ["fullName", "designation", "department", "ctc", "reportingDate", "companyName", "currentDate"],
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
<p style="text-align:right;">Date: {{currentDate}}</p>
<h2 style="text-align:center;">OFFER LETTER</h2>
<p>Dear <strong>{{fullName}}</strong>,</p>
<p>We are pleased to offer you the position of <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department at <strong>{{companyName}}</strong>.</p>
<p><strong>Key Terms:</strong></p>
<ul>
  <li>Designation: {{designation}}</li>
  <li>Department: {{department}}</li>
  <li>CTC: ₹{{ctc}} per annum</li>
  <li>Reporting Date: {{reportingDate}}</li>
</ul>
<p>This offer is subject to successful completion of background verification and document submission.</p>
<p>Please sign and return a copy of this letter as your acceptance.</p>
<br/>
<p>Regards,</p>
<p><strong>HR Department</strong><br/>{{companyName}}</p>
</div>`,
  },
  {
    code: "appointment_letter",
    name: "Appointment Letter",
    variables: ["fullName", "employeeCode", "designation", "department", "joiningDate", "companyName", "currentDate"],
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
<p style="text-align:right;">Date: {{currentDate}}</p>
<h2 style="text-align:center;">APPOINTMENT LETTER</h2>
<p>Dear <strong>{{fullName}}</strong>,</p>
<p>We are pleased to appoint you as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department of <strong>{{companyName}}</strong>, effective <strong>{{joiningDate}}</strong>.</p>
<p>Your Employee Code is: <strong>{{employeeCode}}</strong></p>
<p>You will be governed by the company's HR policies, which will be shared with you separately. This appointment is subject to a probation period of 6 months.</p>
<p>We look forward to your contributions to the team.</p>
<br/>
<p>Regards,</p>
<p><strong>HR Department</strong><br/>{{companyName}}</p>
</div>`,
  },
  {
    code: "confirmation_letter",
    name: "Confirmation Letter",
    variables: ["fullName", "employeeCode", "designation", "department", "joiningDate", "confirmationDate", "companyName", "currentDate"],
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
<p style="text-align:right;">Date: {{currentDate}}</p>
<h2 style="text-align:center;">CONFIRMATION LETTER</h2>
<p>Dear <strong>{{fullName}}</strong>,</p>
<p>We are pleased to confirm your employment with <strong>{{companyName}}</strong> as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department with effect from <strong>{{confirmationDate}}</strong>.</p>
<p>Your Employee Code is: <strong>{{employeeCode}}</strong>. You joined us on <strong>{{joiningDate}}</strong> and have successfully completed your probationary period.</p>
<p>All other terms and conditions of your employment remain unchanged. We look forward to your continued contributions.</p>
<br/>
<p>Regards,</p>
<p><strong>HR Department</strong><br/>{{companyName}}</p>
</div>`,
  },
  {
    code: "experience_letter",
    name: "Experience Letter",
    variables: ["fullName", "employeeCode", "designation", "department", "joiningDate", "lastWorkingDay", "yearsOfService", "companyName", "currentDate"],
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
<p style="text-align:right;">Date: {{currentDate}}</p>
<h2 style="text-align:center;">EXPERIENCE LETTER</h2>
<p>To Whomsoever It May Concern,</p>
<p>This is to certify that <strong>{{fullName}}</strong> (Employee Code: <strong>{{employeeCode}}</strong>) was employed with <strong>{{companyName}}</strong> as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department from <strong>{{joiningDate}}</strong> to <strong>{{lastWorkingDay}}</strong> — a tenure of <strong>{{yearsOfService}}</strong>.</p>
<p>During their tenure, {{fullName}} demonstrated professionalism and dedication. We wish them all the best in their future endeavours.</p>
<br/>
<p>Regards,</p>
<p><strong>HR Department</strong><br/>{{companyName}}</p>
</div>`,
  },
  {
    code: "relieving_letter",
    name: "Relieving Letter",
    variables: ["fullName", "employeeCode", "designation", "department", "lastWorkingDay", "companyName", "currentDate"],
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
<p style="text-align:right;">Date: {{currentDate}}</p>
<h2 style="text-align:center;">RELIEVING LETTER</h2>
<p>To Whomsoever It May Concern,</p>
<p>This is to certify that <strong>{{fullName}}</strong> (Employee Code: <strong>{{employeeCode}}</strong>), <strong>{{designation}}</strong> — <strong>{{department}}</strong>, has been relieved from the services of <strong>{{companyName}}</strong> effective close of business on <strong>{{lastWorkingDay}}</strong>.</p>
<p>All company property has been returned and dues have been settled. We wish {{fullName}} success in their future career.</p>
<br/>
<p>Regards,</p>
<p><strong>HR Department</strong><br/>{{companyName}}</p>
</div>`,
  },
  {
    code: "salary_certificate",
    name: "Salary Certificate",
    variables: ["fullName", "employeeCode", "designation", "department", "joiningDate", "grossSalary", "companyName", "currentDate"],
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
<p style="text-align:right;">Date: {{currentDate}}</p>
<h2 style="text-align:center;">SALARY CERTIFICATE</h2>
<p>To Whomsoever It May Concern,</p>
<p>This is to certify that <strong>{{fullName}}</strong> (Employee Code: <strong>{{employeeCode}}</strong>) is currently employed with <strong>{{companyName}}</strong> as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department since <strong>{{joiningDate}}</strong>.</p>
<p>Their current gross monthly salary is <strong>₹{{grossSalary}}</strong>.</p>
<p>This certificate is issued at the request of the employee for bonafide purposes only.</p>
<br/>
<p>Regards,</p>
<p><strong>HR Department</strong><br/>{{companyName}}</p>
</div>`,
  },
  {
    code: "increment_letter",
    name: "Increment Letter",
    variables: ["fullName", "employeeCode", "designation", "department", "oldSalary", "newSalary", "effectiveDate", "companyName", "currentDate"],
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
<p style="text-align:right;">Date: {{currentDate}}</p>
<h2 style="text-align:center;">SALARY INCREMENT LETTER</h2>
<p>Dear <strong>{{fullName}}</strong>,</p>
<p>We are pleased to inform you that based on your performance and contribution to <strong>{{companyName}}</strong>, your salary has been revised as follows:</p>
<table style="border-collapse:collapse; width:100%; margin: 16px 0;">
  <tr style="background:#f3f4f6;"><th style="border:1px solid #d1d5db; padding:8px; text-align:left;">Component</th><th style="border:1px solid #d1d5db; padding:8px;">Previous</th><th style="border:1px solid #d1d5db; padding:8px;">Revised</th></tr>
  <tr><td style="border:1px solid #d1d5db; padding:8px;">Gross Monthly Salary</td><td style="border:1px solid #d1d5db; padding:8px; text-align:center;">₹{{oldSalary}}</td><td style="border:1px solid #d1d5db; padding:8px; text-align:center;">₹{{newSalary}}</td></tr>
</table>
<p>This revision is effective from <strong>{{effectiveDate}}</strong>. All other terms and conditions remain unchanged.</p>
<br/>
<p>Regards,</p>
<p><strong>HR Department</strong><br/>{{companyName}}</p>
</div>`,
  },
  {
    code: "warning_letter",
    name: "Warning Letter",
    variables: ["fullName", "employeeCode", "designation", "department", "issueDescription", "companyName", "currentDate"],
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
<p style="text-align:right;">Date: {{currentDate}}</p>
<h2 style="text-align:center;">WARNING LETTER</h2>
<p>Dear <strong>{{fullName}}</strong>,</p>
<p>This letter serves as a formal warning regarding the following matter:</p>
<p style="background:#fef3c7; padding:12px; border-left:4px solid #f59e0b;">{{issueDescription}}</p>
<p>This behaviour/conduct is in violation of the company's policies and is unacceptable. You are advised to immediately rectify the same and ensure it does not recur.</p>
<p>Failure to improve may result in further disciplinary action, up to and including termination of employment.</p>
<p>Please acknowledge receipt of this letter by signing below.</p>
<br/>
<p>Regards,</p>
<p><strong>HR Department</strong><br/>{{companyName}}</p>
<br/>
<p>Employee Acknowledgement: _______________________  Date: ___________</p>
</div>`,
  },
];

function fillTemplate(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

router.get("/letters/templates", requireAuth, async (_req, res) => {
  try {
    const templates = await db.select().from(letterTemplatesTable);
    res.json(templates);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post("/letters/templates/seed", requireAuth, requireRole("super_admin", "hr_admin"), async (_req, res) => {
  try {
    const seeded: string[] = [];
    for (const t of SEED_TEMPLATES) {
      const [existing] = await db.select().from(letterTemplatesTable).where(eq(letterTemplatesTable.code, t.code));
      if (existing) continue;
      await db.insert(letterTemplatesTable).values({ id: crypto.randomUUID(), ...t });
      seeded.push(t.code);
    }
    res.json({ seeded });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post("/letters/templates", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const id = crypto.randomUUID();
    await db.insert(letterTemplatesTable).values({ id, ...req.body, variables: req.body.variables ?? [] });
    const [tmpl] = await db.select().from(letterTemplatesTable).where(eq(letterTemplatesTable.id, id));
    res.status(201).json(tmpl);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.patch("/letters/templates/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.update(letterTemplatesTable).set(req.body).where(eq(letterTemplatesTable.id, req.params.id as string));
    const [tmpl] = await db.select().from(letterTemplatesTable).where(eq(letterTemplatesTable.id, req.params.id as string));
    if (!tmpl) { res.status(404).json({ error: "Not found" }); return; }
    res.json(tmpl);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.delete("/letters/templates/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.delete(letterTemplatesTable).where(eq(letterTemplatesTable.id, req.params.id as string));
    res.status(204).send();
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Generate a letter for an employee
router.post("/letters/generate", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const { employeeId, templateId, extraVars } = req.body as { employeeId: string; templateId: string; extraVars?: Record<string, string> };

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    const [tmpl] = await db.select().from(letterTemplatesTable).where(eq(letterTemplatesTable.id, templateId));
    if (!tmpl) { res.status(404).json({ error: "Template not found" }); return; }

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
    res.status(201).json({ ...letter, employeeName: `${emp.firstName} ${emp.lastName}` });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get("/letters/generated", requireAuth, async (_req, res) => {
  try {
    const letters = await db.select().from(generatedLettersTable).orderBy(desc(generatedLettersTable.createdAt));
    const employees = await db.select().from(employeesTable);
    const empMap = new Map(employees.map(e => [e.id, `${e.firstName} ${e.lastName}`]));
    res.json(letters.map(l => ({ ...l, employeeName: empMap.get(l.employeeId) ?? "" })));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get("/letters/generated/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const [letter] = await db.select().from(generatedLettersTable).where(eq(generatedLettersTable.id, req.params.id as string));
    if (!letter) { res.status(404).json({ error: "Not found" }); return; }
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, letter.employeeId));
    res.json({ ...letter, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "" });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.delete("/letters/generated/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.delete(generatedLettersTable).where(eq(generatedLettersTable.id, req.params.id as string));
    res.status(204).send();
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
