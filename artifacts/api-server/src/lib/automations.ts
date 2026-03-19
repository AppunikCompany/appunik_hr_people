import { Resend } from "resend";
import { db } from "@workspace/db";
import {
  automationRulesTable,
  automationLogsTable,
  emailTemplatesTable,
  employeesTable,
  attendanceRecordsTable,
  leaveRequestsTable,
  kraAssignmentsTable,
  reviewCyclesTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

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
  | "employee.birthday"
  | "employee.work_anniversary"
  | "employee.offboarding_started"
  | "attendance.late_arrival"
  | "attendance.absent_no_leave"
  | "leave.applied"
  | "leave.approved"
  | "leave.rejected"
  | "leave.balance_low"
  | "asset.assigned"
  | "asset.returned"
  | "onboarding.started"
  | "onboarding.completed"
  | "onboarding.task_completed"
  | "kra.assigned"
  | "kra.self_assessed"
  | "kra.completed"
  | "kra.deadline_approaching";

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

    const recipientList = typeof rule.recipients === "string"
      ? rule.recipients.split(",").map((r) => r.trim())
      : [];

    const recipientEmails: string[] = [];
    for (const recipient of recipientList) {
      if (recipient === "employee") {
        recipientEmails.push(employee.email);
      } else if (recipient === "hr_admin") {
        if (process.env.HR_ADMIN_EMAIL) recipientEmails.push(process.env.HR_ADMIN_EMAIL);
      } else if (recipient === "manager") {
        if (employee.reportingManagerId) {
          const [mgr] = await db
            .select()
            .from(employeesTable)
            .where(eq(employeesTable.id, employee.reportingManagerId));
          if (mgr) recipientEmails.push(mgr.email);
        }
      } else if (recipient.includes("@")) {
        recipientEmails.push(recipient);
      }
    }

    const uniqueEmails = [...new Set(recipientEmails)];

    let status: "sent" | "failed" = "sent";
    let errorMsg: string | null = null;

    if (resend && uniqueEmails.length > 0) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: uniqueEmails,
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
      templateCode: template.code,
      recipientEmail: uniqueEmails.join(", ") || "none",
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
          event: "employee.birthday",
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
          event: "employee.work_anniversary",
          employeeId: emp.id,
          variables: { eventType: "work_anniversary", years: String(years) },
        });
      }
    }

    if (emp.probationEndDate) {
      const probEnd = new Date(emp.probationEndDate);
      const daysToEnd = Math.ceil((probEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysToEnd === 7) {
        await fireAutomationEvent({
          event: "employee.probation_end",
          employeeId: emp.id,
          variables: { daysRemaining: "7" },
        });
      }
    }
  }

  // attendance.absent_no_leave: fire for employees with no attendance record yesterday and no approved leave covering yesterday
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const dayOfWeek = yesterday.getDay();
  if (dayOfWeek !== 0 && dayOfWeek !== 6) {
    const attendedYesterday = await db
      .select({ employeeId: attendanceRecordsTable.employeeId })
      .from(attendanceRecordsTable)
      .where(eq(attendanceRecordsTable.date, yesterdayStr));
    const attendedIds = new Set(attendedYesterday.map((r) => r.employeeId));

    for (const emp of employees) {
      if (attendedIds.has(emp.id)) continue;
      const onLeave = await db
        .select()
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.employeeId, emp.id),
            eq(leaveRequestsTable.status, "approved"),
          )
        );
      const coveredByLeave = onLeave.some(
        (lr) => lr.startDate <= yesterdayStr && lr.endDate >= yesterdayStr,
      );
      if (!coveredByLeave) {
        await fireAutomationEvent({
          event: "attendance.absent_no_leave",
          employeeId: emp.id,
          variables: { date: yesterdayStr },
        });
      }
    }
  }

  // kra.deadline_approaching: fire for assignments with open review cycles closing in 7 days
  const in7days = new Date(today);
  in7days.setDate(in7days.getDate() + 7);
  const in7daysStr = in7days.toISOString().split("T")[0];
  const closingCycles = await db
    .select()
    .from(reviewCyclesTable)
    .where(and(eq(reviewCyclesTable.closeDate, in7daysStr), eq(reviewCyclesTable.status, "open")));

  if (closingCycles.length > 0) {
    const cycleIds = closingCycles.map((c) => c.id);
    const pendingAssignments = await db
      .select()
      .from(kraAssignmentsTable)
      .where(
        and(
          inArray(kraAssignmentsTable.cycleId, cycleIds),
          eq(kraAssignmentsTable.status, "pending"),
        ),
      );
    for (const assignment of pendingAssignments) {
      await fireAutomationEvent({
        event: "kra.deadline_approaching",
        employeeId: assignment.employeeId,
        variables: { kraTitle: assignment.kraTitle, daysRemaining: "7" },
      });
    }
  }
}
