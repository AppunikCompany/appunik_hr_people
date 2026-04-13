import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  automationRulesTable,
  automationLogsTable,
  emailTemplatesTable,
  employeesTable,
  employeeDocumentsTable,
  attendanceRecordsTable,
  leaveRequestsTable,
  holidaysTable,
  appConfigTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { runScheduledAutomations, fireAutomationEvent } from "../lib/automations";

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
    await db.update(automationRulesTable).set({ isActive }).where(eq(automationRulesTable.id, (req.params.id as string)));
    const [rule] = await db.select().from(automationRulesTable).where(eq(automationRulesTable.id, (req.params.id as string)));
    if (!rule) { res.status(404).json({ error: "Not found" }); return; }
    const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, rule.templateId));
    res.json({ ...rule, templateName: tmpl?.name ?? "" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/automations/logs", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) ?? "50") || 50));
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
    const etId = crypto.randomUUID();
    await db.insert(emailTemplatesTable).values({ ...req.body, id: etId, variables: req.body.variables ?? [], isActive: req.body.isActive ?? true });
    const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, etId));
    res.status(201).json(tmpl);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/automations/email-templates/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.update(emailTemplatesTable).set(req.body).where(eq(emailTemplatesTable.id, (req.params.id as string)));
    const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, (req.params.id as string)));
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

// ── AU-01→AU-16: Seed all 15 email templates + automation rules ──
const SEED_TEMPLATES = [
  { code: "birthday", name: "Birthday Wish", subject: "Happy Birthday, {{firstName}}! 🎂", bodyHtml: "<p>Dear {{fullName}},</p><p>Wishing you a wonderful birthday! We hope this year brings you great success and happiness.</p><p>Best wishes,<br>HR Team</p>", variables: ["firstName", "fullName"] },
  { code: "work_anniversary", name: "Work Anniversary", subject: "Happy {{years}}-Year Work Anniversary, {{firstName}}!", bodyHtml: "<p>Dear {{fullName}},</p><p>Congratulations on completing {{years}} year(s) with us! Thank you for your dedication and hard work.</p><p>Best wishes,<br>HR Team</p>", variables: ["firstName", "fullName", "years"] },
  { code: "welcome_new_joiner", name: "Welcome — New Joiner", subject: "Welcome to the team, {{firstName}}!", bodyHtml: "<p>Dear {{fullName}},</p><p>Welcome aboard! We're thrilled to have you join us. Your onboarding checklist is ready — please complete it in the HR portal.</p><p>Best regards,<br>HR Team</p>", variables: ["firstName", "fullName"] },
  { code: "onboarding_checklist", name: "Onboarding Checklist Reminder", subject: "Action Required: Complete Your Onboarding Tasks", bodyHtml: "<p>Dear {{fullName}},</p><p>Please complete all pending onboarding tasks in the HR portal. If you need any help, reach out to the HR team.</p><p>Best regards,<br>HR Team</p>", variables: ["fullName"] },
  { code: "probation_end_reminder", name: "Probation End Reminder", subject: "Probation Review Due for {{fullName}} — {{daysRemaining}} Days Left", bodyHtml: "<p>Dear Manager,</p><p>{{fullName}}'s probation period ends in {{daysRemaining}} days. Please schedule a review meeting and update the status in the HR portal.</p><p>Best regards,<br>HR Team</p>", variables: ["fullName", "daysRemaining"] },
  { code: "probation_confirmation", name: "Probation Confirmation", subject: "Probation Confirmed — Welcome Aboard, {{firstName}}!", bodyHtml: "<p>Dear {{fullName}},</p><p>We are pleased to inform you that your probation period has been successfully completed. You are now a confirmed employee.</p><p>Congratulations!<br>HR Team</p>", variables: ["firstName", "fullName"] },
  { code: "leave_approved", name: "Leave Approved", subject: "Your Leave Request Has Been Approved", bodyHtml: "<p>Dear {{fullName}},</p><p>Your leave request from {{startDate}} to {{endDate}} has been approved.</p><p>Best regards,<br>HR Team</p>", variables: ["fullName", "startDate", "endDate"] },
  { code: "leave_rejected", name: "Leave Rejected", subject: "Your Leave Request Has Been Rejected", bodyHtml: "<p>Dear {{fullName}},</p><p>Unfortunately, your leave request from {{startDate}} to {{endDate}} has been rejected. Please check the HR portal for details or contact your manager.</p><p>Best regards,<br>HR Team</p>", variables: ["fullName", "startDate", "endDate"] },
  { code: "leave_reminder", name: "Year-End Leave Reminder", subject: "Reminder: Use or Lose — Check Your Leave Balance", bodyHtml: "<p>Dear {{fullName}},</p><p>The financial year is ending soon. Please review your leave balance and plan any remaining leaves.</p><p>Best regards,<br>HR Team</p>", variables: ["fullName"] },
  { code: "asset_assigned", name: "Asset Assigned", subject: "A New Asset Has Been Assigned to You", bodyHtml: "<p>Dear {{fullName}},</p><p>An asset has been assigned to you. Please acknowledge receipt in the HR portal.</p><p>Best regards,<br>IT / HR Team</p>", variables: ["fullName"] },
  { code: "asset_return_reminder", name: "Asset Return Reminder", subject: "Reminder: Please Return Your Assigned Assets", bodyHtml: "<p>Dear {{fullName}},</p><p>As part of the exit process, please return all assigned assets to the IT team.</p><p>Best regards,<br>IT / HR Team</p>", variables: ["fullName"] },
  { code: "kra_review_reminder", name: "KRA Review Reminder", subject: "Reminder: KRA Review Deadline in {{daysRemaining}} Days", bodyHtml: "<p>Dear {{fullName}},</p><p>Your KRA \"{{kraTitle}}\" review deadline is approaching ({{daysRemaining}} days). Please complete your self-assessment in the portal.</p><p>Best regards,<br>HR Team</p>", variables: ["fullName", "kraTitle", "daysRemaining"] },
  { code: "new_employee_announcement", name: "New Employee Announcement", subject: "Welcome Our New Colleague — {{fullName}}!", bodyHtml: "<p>Team,</p><p>We are excited to announce that {{fullName}} has joined us as a new team member. Please help them settle in!</p><p>Best regards,<br>HR Team</p>", variables: ["fullName"] },
  { code: "exit_offboarding", name: "Exit / Offboarding Email", subject: "Offboarding Process Initiated for {{fullName}}", bodyHtml: "<p>Dear {{fullName}},</p><p>Your offboarding process has been initiated. Please complete all pending handover tasks and return company assets.</p><p>Best regards,<br>HR Team</p>", variables: ["fullName"] },
  { code: "document_expiry_alert", name: "Document Expiry Alert", subject: "Document Expiring Soon: {{documentType}}", bodyHtml: "<p>Dear {{fullName}},</p><p>Your document \"{{documentType}}\" is expiring on {{expiryDate}}. Please renew and upload the updated document in the HR portal.</p><p>Best regards,<br>HR Team</p>", variables: ["fullName", "documentType", "expiryDate"] },
];

const SEED_RULES = [
  { code: "rule_birthday", name: "Birthday Wish", triggerType: "scheduled", triggerEvent: "employee.birthday", cronExpr: "0 9 * * *", templateCode: "birthday", recipients: "employee" },
  { code: "rule_anniversary", name: "Work Anniversary", triggerType: "scheduled", triggerEvent: "employee.work_anniversary", cronExpr: "0 9 * * *", templateCode: "work_anniversary", recipients: "employee" },
  { code: "rule_welcome", name: "Welcome New Joiner", triggerType: "event", triggerEvent: "employee.created", cronExpr: null, templateCode: "welcome_new_joiner", recipients: "employee" },
  { code: "rule_onboarding", name: "Onboarding Checklist", triggerType: "event", triggerEvent: "onboarding.started", cronExpr: null, templateCode: "onboarding_checklist", recipients: "employee" },
  { code: "rule_probation_end", name: "Probation End Reminder", triggerType: "scheduled", triggerEvent: "employee.probation_end", cronExpr: "0 9 * * *", templateCode: "probation_end_reminder", recipients: "hr_admin,manager" },
  { code: "rule_probation_confirm", name: "Probation Confirmation", triggerType: "event", triggerEvent: "employee.probation_end", cronExpr: null, templateCode: "probation_confirmation", recipients: "employee" },
  { code: "rule_leave_approved", name: "Leave Approved", triggerType: "event", triggerEvent: "leave.approved", cronExpr: null, templateCode: "leave_approved", recipients: "employee" },
  { code: "rule_leave_rejected", name: "Leave Rejected", triggerType: "event", triggerEvent: "leave.rejected", cronExpr: null, templateCode: "leave_rejected", recipients: "employee" },
  { code: "rule_leave_reminder", name: "Year-End Leave Reminder", triggerType: "scheduled", triggerEvent: "leave.balance_low", cronExpr: "0 9 1 3 *", templateCode: "leave_reminder", recipients: "employee" },
  { code: "rule_asset_assigned", name: "Asset Assigned", triggerType: "event", triggerEvent: "asset.assigned", cronExpr: null, templateCode: "asset_assigned", recipients: "employee" },
  { code: "rule_asset_return", name: "Asset Return Reminder", triggerType: "event", triggerEvent: "employee.offboarding_started", cronExpr: null, templateCode: "asset_return_reminder", recipients: "employee" },
  { code: "rule_kra_reminder", name: "KRA Review Reminder", triggerType: "scheduled", triggerEvent: "kra.deadline_approaching", cronExpr: "0 9 * * 1", templateCode: "kra_review_reminder", recipients: "employee" },
  { code: "rule_new_emp_announcement", name: "New Employee Announcement", triggerType: "event", triggerEvent: "employee.created", cronExpr: null, templateCode: "new_employee_announcement", recipients: "hr_admin" },
  { code: "rule_exit", name: "Exit / Offboarding", triggerType: "event", triggerEvent: "employee.offboarding_started", cronExpr: null, templateCode: "exit_offboarding", recipients: "employee,hr_admin" },
  { code: "rule_doc_expiry", name: "Document Expiry Alert", triggerType: "event", triggerEvent: "employee.document_expiry", cronExpr: null, templateCode: "document_expiry_alert", recipients: "employee" },
];

router.post("/automations/seed-templates", requireAuth, requireRole("super_admin", "hr_admin"), async (_req, res) => {
  try {
    const seeded: string[] = [];
    const templateIdByCode = new Map<string, string>();

    for (const tmpl of SEED_TEMPLATES) {
      const [existing] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.code, tmpl.code));
      if (existing) {
        templateIdByCode.set(tmpl.code, existing.id);
        continue;
      }
      const id = crypto.randomUUID();
      await db.insert(emailTemplatesTable).values({ id, ...tmpl });
      templateIdByCode.set(tmpl.code, id);
      seeded.push(tmpl.code);
    }

    const rulesSeeded: string[] = [];
    for (const rule of SEED_RULES) {
      const [existing] = await db.select().from(automationRulesTable).where(eq(automationRulesTable.code, rule.code));
      if (existing) continue;
      const templateId = templateIdByCode.get(rule.templateCode);
      if (!templateId) continue;
      await db.insert(automationRulesTable).values({
        name: rule.name,
        code: rule.code,
        triggerType: rule.triggerType,
        triggerEvent: rule.triggerEvent,
        cronExpr: rule.cronExpr,
        templateId,
        recipients: rule.recipients,
      });
      rulesSeeded.push(rule.code);
    }

    res.json({ templatesSeeded: seeded, rulesSeeded });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AU-14: Document expiry alert (CRON-style) ──
router.post("/automations/check-document-expiry", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const daysAhead = parseInt((req.query.days as string) ?? "30");
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + daysAhead);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];

    const allDocs = await db.select().from(employeeDocumentsTable);
    const expiring = allDocs.filter((d) => d.expiryDate && d.expiryDate >= todayStr && d.expiryDate <= cutoffStr);

    let notified = 0;
    for (const doc of expiring) {
      await fireAutomationEvent({
        event: "employee.document_expiry",
        employeeId: doc.employeeId,
        variables: { documentType: doc.documentType, expiryDate: doc.expiryDate! },
      });
      notified++;
    }

    res.json({ checked: allDocs.length, expiringSoon: expiring.length, notified });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AU-18: Attendance regularization (daily check for missed punches) ──
router.post("/automations/attendance-regularization", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const dateStr = (req.query.date as string) ?? new Date().toISOString().split("T")[0];
    const checkDate = new Date(dateStr);
    const dayOfWeek = checkDate.getDay();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      res.json({ message: "Weekend — skipped", date: dateStr, flagged: 0 });
      return;
    }

    const activeEmployees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    const todayRecords = await db
      .select({ employeeId: attendanceRecordsTable.employeeId })
      .from(attendanceRecordsTable)
      .where(eq(attendanceRecordsTable.date, dateStr));
    const markedIds = new Set(todayRecords.map((r) => r.employeeId));

    // Check approved leave covering this date
    const allLeaves = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.status, "approved"));

    let flagged = 0;
    for (const emp of activeEmployees) {
      if (markedIds.has(emp.id)) continue;
      const onLeave = allLeaves.some(
        (lr) => lr.employeeId === emp.id && lr.startDate <= dateStr && lr.endDate >= dateStr,
      );
      if (onLeave) continue;

      await fireAutomationEvent({
        event: "attendance.absent_no_leave",
        employeeId: emp.id,
        variables: { date: dateStr },
      });
      flagged++;
    }

    res.json({ date: dateStr, totalActive: activeEmployees.length, flagged });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AU-19: WFH Approval mode toggle ──
router.get("/automations/wfh-approval-config", requireAuth, async (_req, res) => {
  try {
    const [cfg] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, "wfh_requires_approval"));
    res.json({ wfhRequiresApproval: cfg?.value === "true" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/automations/wfh-approval-config", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    const value = String(enabled);
    const [existing] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, "wfh_requires_approval"));
    if (existing) {
      await db.update(appConfigTable).set({ value }).where(eq(appConfigTable.id, existing.id));
    } else {
      await db.insert(appConfigTable).values({ key: "wfh_requires_approval", value });
    }
    res.json({ wfhRequiresApproval: enabled });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AU-20: Holiday announcement (send upcoming holidays for next month) ──
router.post("/automations/holiday-announcement", requireAuth, requireRole("super_admin", "hr_admin"), async (_req, res) => {
  try {
    const today = new Date();
    const nextMonth = today.getMonth() + 2; // getMonth is 0-based
    const nextMonthYear = nextMonth > 12 ? today.getFullYear() + 1 : today.getFullYear();
    const nm = nextMonth > 12 ? 1 : nextMonth;

    const allHolidays = await db.select().from(holidaysTable).where(eq(holidaysTable.year, nextMonthYear));
    const upcoming = allHolidays.filter((h) => {
      const d = new Date(h.date);
      return d.getMonth() + 1 === nm;
    });

    if (upcoming.length === 0) {
      res.json({ message: "No holidays next month", notified: 0 });
      return;
    }

    const holidayList = upcoming.map((h) => `${h.date} — ${h.name} (${h.type})`).join("\n");
    const activeEmployees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));

    let notified = 0;
    for (const emp of activeEmployees) {
      await fireAutomationEvent({
        event: "holiday.announcement",
        employeeId: emp.id,
        variables: { holidayList, monthName: new Date(nextMonthYear, nm - 1).toLocaleString("en", { month: "long" }) },
      });
      notified++;
    }

    res.json({ month: nm, year: nextMonthYear, holidays: upcoming.length, notified });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
