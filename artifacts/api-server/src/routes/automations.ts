import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  automationRulesTable,
  automationLogsTable,
  emailTemplatesTable,
  employeesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { runScheduledAutomations } from "../lib/automations";

const router: IRouter = Router();

router.get("/automations/rules", requireAuth, async (_req, res) => {
  try {
    const rules = await db.select().from(automationRulesTable);
    const templates = await db.select().from(emailTemplatesTable);
    const tmplMap = new Map(templates.map((t) => [t.id, t.name]));
    const result = rules.map((r) => ({
      ...r,
      templateName: tmplMap.get(r.templateId) ?? "",
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/automations/rules/:id/toggle", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { isActive } = req.body as { isActive: boolean };
    const [rule] = await db
      .update(automationRulesTable)
      .set({ isActive })
      .where(eq(automationRulesTable.id, (req.params.id as string)))
      .returning();
    if (!rule) { res.status(404).json({ error: "Not found" }); return; }
    const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, rule.templateId));
    res.json({ ...rule, templateName: tmpl?.name ?? "" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/automations/logs", requireAuth, async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? "50");
    const logs = await db
      .select()
      .from(automationLogsTable)
      .orderBy(desc(automationLogsTable.sentAt))
      .limit(limit);

    const rules = await db.select().from(automationRulesTable);
    const employees = await db.select().from(employeesTable);
    const ruleMap = new Map(rules.map((r) => [r.id, r.name]));
    const empMap = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

    const result = logs.map((l) => ({
      ...l,
      ruleName: ruleMap.get(l.ruleId) ?? "",
      employeeName: l.employeeId ? (empMap.get(l.employeeId) ?? null) : null,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/automations/email-templates", requireAuth, async (_req, res) => {
  try {
    const templates = await db.select().from(emailTemplatesTable);
    res.json(templates);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/automations/email-templates", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const [tmpl] = await db
      .insert(emailTemplatesTable)
      .values({ ...req.body, variables: req.body.variables ?? [], isActive: req.body.isActive ?? true })
      .returning();
    res.status(201).json(tmpl);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/automations/email-templates/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const [tmpl] = await db
      .update(emailTemplatesTable)
      .set(req.body)
      .where(eq(emailTemplatesTable.id, (req.params.id as string)))
      .returning();
    if (!tmpl) { res.status(404).json({ error: "Not found" }); return; }
    res.json(tmpl);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/automations/run-scheduled", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const today = (req.query.date as string) ?? new Date().toISOString().split("T")[0];
    await runScheduledAutomations({ today });
    res.json({ success: true, date: today });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
