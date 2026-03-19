import { Resend } from "resend";
import { db } from "@workspace/db";
import {
  automationRulesTable,
  automationLogsTable,
  emailTemplatesTable,
  employeesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "hr@technovasolutions.com";

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export type AutomationEvent =
  | "employee.created"
  | "employee.probation_end"
  | "leave.applied"
  | "leave.approved"
  | "leave.rejected"
  | "asset.assigned"
  | "asset.returned"
  | "onboarding.started"
  | "onboarding.completed"
  | "kra.assigned"
  | "kra.self_assessed"
  | "kra.completed";

interface FireEventOptions {
  event: AutomationEvent;
  employeeId: string;
  variables?: Record<string, string>;
}

export async function fireAutomationEvent(opts: FireEventOptions): Promise<void> {
  const { event, employeeId, variables = {} } = opts;

  const rules = await db
    .select()
    .from(automationRulesTable)
    .where(
      and(
        eq(automationRulesTable.triggerEvent, event),
        eq(automationRulesTable.isActive, true)
      )
    );

  if (rules.length === 0) return;

  const [employee] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId));

  if (!employee) return;

  const empVars: Record<string, string> = {
    firstName: employee.firstName,
    lastName: employee.lastName,
    fullName: `${employee.firstName} ${employee.lastName}`,
    email: employee.email,
    employeeCode: employee.employeeCode,
    ...variables,
  };

  for (const rule of rules) {
    const [template] = await db
      .select()
      .from(emailTemplatesTable)
      .where(eq(emailTemplatesTable.id, rule.templateId));

    if (!template) continue;

    const subject = interpolate(template.subject, empVars);
    const body = interpolate(template.bodyHtml, empVars);

    let recipientEmails: string[] = [];
    const recipients = Array.isArray(rule.recipients) ? rule.recipients : [];

    for (const recipient of recipients) {
      if (recipient === "employee") {
        recipientEmails.push(employee.email);
      } else if (recipient === "hr_admin" || recipient === "manager") {
        if (employee.reportingManagerId) {
          const [mgr] = await db
            .select()
            .from(employeesTable)
            .where(eq(employeesTable.id, employee.reportingManagerId));
          if (mgr) recipientEmails.push(mgr.email);
        }
      }
    }

    recipientEmails = [...new Set(recipientEmails)];

    let status: "sent" | "failed" = "sent";
    let errorMsg: string | null = null;

    if (resend && recipientEmails.length > 0) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: recipientEmails,
          subject,
          html: `<div style="font-family:Inter,sans-serif;max-width:600px;margin:auto">${body.replace(/\n/g, "<br>")}</div>`,
        });
      } catch (err) {
        status = "failed";
        errorMsg = String(err);
      }
    }

    await db.insert(automationLogsTable).values({
      ruleId: rule.id,
      employeeId,
      recipientEmail: recipientEmails.join(", "),
      subject,
      status,
      errorMessage: errorMsg,
    });
  }
}

export interface ScheduledJobContext {
  today: string;
}

export async function runScheduledAutomations(ctx: ScheduledJobContext): Promise<void> {
  const today = new Date(ctx.today);
  const mm = today.getMonth() + 1;
  const dd = today.getDate();

  const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));

  for (const emp of employees) {
    if (emp.dateOfBirth) {
      const dob = new Date(emp.dateOfBirth);
      if (dob.getMonth() + 1 === mm && dob.getDate() === dd) {
        await fireAutomationEvent({
          event: "employee.created",
          employeeId: emp.id,
          variables: { eventType: "birthday" },
        });
      }
    }

    if (emp.joiningDate) {
      const joined = new Date(emp.joiningDate);
      if (joined.getMonth() + 1 === mm && joined.getDate() === dd && joined.getFullYear() < today.getFullYear()) {
        const years = today.getFullYear() - joined.getFullYear();
        await fireAutomationEvent({
          event: "employee.created",
          employeeId: emp.id,
          variables: { eventType: "work_anniversary", years: String(years) },
        });
      }
    }
  }
}
