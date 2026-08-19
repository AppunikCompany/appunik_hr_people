import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { letterTemplatesTable, generatedLettersTable, employeesTable, designationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { getRequestEmployeeId, isDocumentAdmin } from "../lib/ownership";

const router: IRouter = Router();

// ── LETTER TEMPLATES ──

router.get("/letters/templates", requireAuth, requireRole("super_admin", "hr_admin"), async (_req, res) => {
  try {
    const templates = await db.select().from(letterTemplatesTable).orderBy(letterTemplatesTable.name);
    res.json(templates);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/letters/templates", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { name, code, bodyHtml, variables } = req.body as { name?: string; code?: string; bodyHtml?: string; variables?: string[] };
    if (!name?.trim()) { res.status(400).json({ error: "Template name is required" }); return; }
    if (!bodyHtml?.trim()) { res.status(400).json({ error: "Template body is required" }); return; }
    const resolvedCode = (code?.trim() || name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
    const id = crypto.randomUUID();
    await db.insert(letterTemplatesTable).values({ id, name: name.trim(), code: resolvedCode, bodyHtml: bodyHtml.trim(), variables: variables ?? [] });
    const [template] = await db.select().from(letterTemplatesTable).where(eq(letterTemplatesTable.id, id));
    res.status(201).json(template);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put("/letters/templates/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const { name, bodyHtml, variables, isActive } = req.body as { name?: string; bodyHtml?: string; variables?: string[]; isActive?: boolean };
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name.trim();
    if (bodyHtml !== undefined) updates.bodyHtml = bodyHtml;
    if (variables !== undefined) updates.variables = variables;
    if (isActive !== undefined) updates.isActive = isActive;
    await db.update(letterTemplatesTable).set(updates).where(eq(letterTemplatesTable.id, id));
    const [template] = await db.select().from(letterTemplatesTable).where(eq(letterTemplatesTable.id, id));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }
    res.json(template);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/letters/templates/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.delete(letterTemplatesTable).where(eq(letterTemplatesTable.id, req.params.id as string));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── GENERATED LETTERS ──

router.get("/letters/generated", requireAuth, async (req, res) => {
  try {
    let letters = await db.select().from(generatedLettersTable).orderBy(generatedLettersTable.createdAt);

    if (!isDocumentAdmin(req)) {
      // Employee: only see their own letters
      const ownEmployeeId = await getRequestEmployeeId(req);
      if (!ownEmployeeId) { res.json([]); return; }
      letters = letters.filter((l) => l.employeeId === ownEmployeeId);
    } else {
      // Admin: optionally filter by employeeId
      const empId = req.query.employeeId as string | undefined;
      if (empId) letters = letters.filter((l) => l.employeeId === empId);
    }

    // Enrich with employee name
    const enriched = await Promise.all(letters.map(async (l) => {
      const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, l.employeeId));
      return { ...l, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown" };
    }));

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/letters/generate", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { templateId, employeeId } = req.body as { templateId?: string; employeeId?: string };
    if (!templateId) { res.status(400).json({ error: "Template ID is required" }); return; }
    if (!employeeId) { res.status(400).json({ error: "Employee ID is required" }); return; }

    const [template] = await db.select().from(letterTemplatesTable).where(eq(letterTemplatesTable.id, templateId));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    // Fetch designation name if available
    const [desig] = emp.designationId
      ? await db.select().from(designationsTable).where(eq(designationsTable.id, emp.designationId))
      : [];

    // Replace template variables with employee data
    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const variableMap: Record<string, string> = {
      "{{employee_name}}": `${emp.firstName} ${emp.lastName}`,
      "{{first_name}}": emp.firstName,
      "{{last_name}}": emp.lastName,
      "{{employee_code}}": emp.employeeCode ?? "",
      "{{designation}}": desig?.name ?? "",
      "{{department}}": "",
      "{{joining_date}}": emp.joiningDate ?? "",
      "{{date}}": today,
      "{{today}}": today,
    };

    let generatedHtml = template.bodyHtml;
    for (const [key, val] of Object.entries(variableMap)) {
      generatedHtml = generatedHtml.replaceAll(key, val);
    }

    const id = crypto.randomUUID();
    await db.insert(generatedLettersTable).values({
      id,
      employeeId,
      templateId,
      templateName: template.name,
      generatedHtml,
    });

    const [letter] = await db.select().from(generatedLettersTable).where(eq(generatedLettersTable.id, id));
    res.status(201).json({ ...letter, employeeName: `${emp.firstName} ${emp.lastName}` });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/letters/generated/:id", requireAuth, async (req, res) => {
  try {
    const [letter] = await db.select().from(generatedLettersTable).where(eq(generatedLettersTable.id, req.params.id as string));
    if (!letter) { res.status(404).json({ error: "Letter not found" }); return; }

    // Access check: employee can only see their own letter
    if (!isDocumentAdmin(req)) {
      const ownEmployeeId = await getRequestEmployeeId(req);
      if (!ownEmployeeId || ownEmployeeId !== letter.employeeId) { res.status(403).json({ error: "Forbidden" }); return; }
    }

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, letter.employeeId));
    res.json({ ...letter, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/letters/generated/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.delete(generatedLettersTable).where(eq(generatedLettersTable.id, req.params.id as string));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
