import { db } from "@workspace/db";
import { emailTemplatesTable, automationRulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

// Shared email wrapper
const emailWrap = (headerColor: string, headerEmoji: string, headerTitle: string, body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:${headerColor};padding:32px 40px;text-align:center;">
          <div style="font-size:40px;margin-bottom:8px;">${headerEmoji}</div>
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${headerTitle}</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px 28px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8f9fb;padding:20px 40px;border-top:1px solid #eaedf0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated message from the HR System. Please do not reply to this email.</p>
          <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;">© {{companyName}} · All rights reserved</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

const bodyText = (lines: string[]) => lines.map(l => `<p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.65;">${l}</p>`).join("\n");

const detailsTable = (rows: [string, string][]) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border-radius:8px;margin:20px 0;overflow:hidden;">
  ${rows.map(([label, value]) => `
  <tr>
    <td style="padding:10px 16px;font-size:13px;color:#6b7280;width:40%;border-bottom:1px solid #eaedf0;">${label}</td>
    <td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:600;border-bottom:1px solid #eaedf0;">${value}</td>
  </tr>`).join("")}
</table>`.trim();

const ctaButton = (label: string, url = "#") =>
  `<div style="text-align:center;margin:24px 0;"><a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">${label}</a></div>`;

const SEED_TEMPLATES = [
  {
    code: "birthday",
    name: "Birthday Wish",
    subject: "🎂 Happy Birthday, {{firstName}}!",
    variables: ["firstName", "fullName", "companyName"],
    bodyHtml: emailWrap(
      "linear-gradient(135deg,#f97316,#f59e0b)",
      "🎂",
      "Happy Birthday!",
      bodyText([
        "Dear <strong>{{fullName}}</strong>,",
        "On behalf of everyone at <strong>{{companyName}}</strong>, we wish you a very Happy Birthday! 🎉",
        "Today is your day — we hope it's filled with joy, laughter, and everything you love.",
        "Your energy and contributions make our workplace brighter every day. Here's to another great year ahead!",
        "With warm wishes,<br><strong>HR Team · {{companyName}}</strong>",
      ])
    ),
  },
  {
    code: "work_anniversary",
    name: "Work Anniversary",
    subject: "🏆 Happy {{years}}-Year Work Anniversary, {{firstName}}!",
    variables: ["firstName", "fullName", "years", "designation", "department", "companyName"],
    bodyHtml: emailWrap(
      "linear-gradient(135deg,#7c3aed,#a855f7)",
      "🏆",
      "Work Anniversary",
      bodyText([
        "Dear <strong>{{fullName}}</strong>,",
        "Today marks <strong>{{years}} year(s)</strong> since you joined <strong>{{companyName}}</strong> — and what a journey it has been!",
      ]) +
      detailsTable([
        ["Name", "{{fullName}}"],
        ["Designation", "{{designation}}"],
        ["Department", "{{department}}"],
        ["Years Completed", "{{years}} Year(s)"],
      ]) +
      bodyText([
        "Your dedication, hard work, and commitment have been invaluable to our team. We are proud to have you with us and look forward to many more years of success together.",
        "Thank you for being an integral part of our journey. 🌟",
        "With appreciation,<br><strong>HR Team · {{companyName}}</strong>",
      ])
    ),
  },
  {
    code: "welcome_new_joiner",
    name: "Welcome — New Joiner",
    subject: "👋 Welcome to the team, {{firstName}}!",
    variables: ["firstName", "fullName", "designation", "department", "joiningDate", "employeeCode", "companyName"],
    bodyHtml: emailWrap(
      "linear-gradient(135deg,#2563eb,#0ea5e9)",
      "👋",
      "Welcome Aboard!",
      bodyText([
        "Dear <strong>{{fullName}}</strong>,",
        "We are thrilled to welcome you to <strong>{{companyName}}</strong>! 🎉 We're so glad to have you on board.",
      ]) +
      detailsTable([
        ["Employee Name", "{{fullName}}"],
        ["Employee Code", "{{employeeCode}}"],
        ["Designation", "{{designation}}"],
        ["Department", "{{department}}"],
        ["Date of Joining", "{{joiningDate}}"],
      ]) +
      bodyText([
        "Your onboarding process has been initiated. Please log in to the HR portal to complete your onboarding checklist, submit required documents, and get familiar with our policies.",
        "Your manager and the HR team are here to help you settle in — don't hesitate to reach out!",
        "We look forward to achieving great things together. 🚀",
        "Warm regards,<br><strong>HR Team · {{companyName}}</strong>",
      ]) +
      ctaButton("Open HR Portal")
    ),
  },
  {
    code: "probation_confirmation",
    name: "Probation Completion",
    subject: "✅ Congratulations! Your Probation Period Is Complete",
    variables: ["firstName", "fullName", "designation", "department", "confirmationDate", "companyName"],
    bodyHtml: emailWrap(
      "linear-gradient(135deg,#16a34a,#22c55e)",
      "✅",
      "Probation Successfully Completed!",
      bodyText([
        "Dear <strong>{{fullName}}</strong>,",
        "We are pleased to inform you that you have successfully completed your probation period at <strong>{{companyName}}</strong>. Congratulations on becoming a confirmed employee! 🎊",
      ]) +
      detailsTable([
        ["Employee Name", "{{fullName}}"],
        ["Designation", "{{designation}}"],
        ["Department", "{{department}}"],
        ["Confirmation Date", "{{confirmationDate}}"],
      ]) +
      bodyText([
        "Your performance during the probation period has been commendable. We are confident you will continue to grow and contribute significantly to the team.",
        "Please log in to the HR portal to review your updated employment details. For any queries, feel free to reach out to the HR team.",
        "Welcome to the family — officially! 🌟",
        "Congratulations once again,<br><strong>HR Team · {{companyName}}</strong>",
      ]) +
      ctaButton("View My Profile")
    ),
  },
  {
    code: "leave_approved",
    name: "Leave Approved",
    subject: "✅ Your Leave Request Has Been Approved",
    variables: ["fullName", "leaveType", "startDate", "endDate", "totalDays", "approvedBy", "companyName"],
    bodyHtml: emailWrap(
      "linear-gradient(135deg,#16a34a,#4ade80)",
      "✅",
      "Leave Request Approved",
      bodyText([
        "Dear <strong>{{fullName}}</strong>,",
        "Your leave request has been reviewed and <strong style='color:#16a34a;'>approved</strong>. Here are the details:",
      ]) +
      detailsTable([
        ["Leave Type", "{{leaveType}}"],
        ["From", "{{startDate}}"],
        ["To", "{{endDate}}"],
        ["Total Days", "{{totalDays}} Day(s)"],
        ["Approved By", "{{approvedBy}}"],
      ]) +
      bodyText([
        "Please ensure all your pending tasks are handed over before your leave begins. If you need to make any changes, please contact the HR team well in advance.",
        "Have a restful break! 😊",
        "Best regards,<br><strong>HR Team · {{companyName}}</strong>",
      ])
    ),
  },
  {
    code: "leave_rejected",
    name: "Leave Rejected",
    subject: "❌ Your Leave Request Has Been Rejected",
    variables: ["fullName", "leaveType", "startDate", "endDate", "totalDays", "rejectedBy", "reason", "companyName"],
    bodyHtml: emailWrap(
      "linear-gradient(135deg,#dc2626,#f87171)",
      "❌",
      "Leave Request Not Approved",
      bodyText([
        "Dear <strong>{{fullName}}</strong>,",
        "We regret to inform you that your leave request has been <strong style='color:#dc2626;'>rejected</strong>. Here are the details:",
      ]) +
      detailsTable([
        ["Leave Type", "{{leaveType}}"],
        ["From", "{{startDate}}"],
        ["To", "{{endDate}}"],
        ["Total Days", "{{totalDays}} Day(s)"],
        ["Rejected By", "{{rejectedBy}}"],
        ["Reason", "{{reason}}"],
      ]) +
      bodyText([
        "If you have any questions regarding this decision, please speak to your reporting manager or contact the HR team directly.",
        "You can also apply for alternate dates through the HR portal.",
        "Best regards,<br><strong>HR Team · {{companyName}}</strong>",
      ]) +
      ctaButton("Apply Again")
    ),
  },
  {
    code: "holiday_announcement",
    name: "Holiday Announcement",
    subject: "🎉 Holiday Announcement: {{holidayName}} on {{holidayDate}}",
    variables: ["holidayName", "holidayDate", "dayOfWeek", "description", "companyName"],
    bodyHtml: emailWrap(
      "linear-gradient(135deg,#0891b2,#06b6d4)",
      "🗓️",
      "Holiday Announcement",
      bodyText([
        "Dear Team,",
        "We are pleased to announce that <strong>{{companyName}}</strong> will observe a public holiday for <strong>{{holidayName}}</strong>.",
      ]) +
      detailsTable([
        ["Holiday", "{{holidayName}}"],
        ["Date", "{{holidayDate}}"],
        ["Day", "{{dayOfWeek}}"],
        ["Note", "{{description}}"],
      ]) +
      bodyText([
        "Offices will remain closed on this day. All employees are requested to plan their work accordingly and ensure that critical tasks are completed before the holiday.",
        "Any on-call or emergency support requirements will be communicated separately by respective managers.",
        "Wishing you a wonderful holiday! 🌟",
        "Best regards,<br><strong>HR Team · {{companyName}}</strong>",
      ])
    ),
  },
];

const SEED_RULES = [
  { code: "rule_birthday", name: "Birthday Wish", triggerType: "scheduled", triggerEvent: "employee.birthday", cronExpr: "0 9 * * *", templateCode: "birthday", recipients: "employee" },
  { code: "rule_anniversary", name: "Work Anniversary", triggerType: "scheduled", triggerEvent: "employee.work_anniversary", cronExpr: "0 9 * * *", templateCode: "work_anniversary", recipients: "employee" },
  { code: "rule_welcome", name: "Welcome New Joiner", triggerType: "event", triggerEvent: "employee.created", cronExpr: null, templateCode: "welcome_new_joiner", recipients: "employee" },
  { code: "rule_probation_confirm", name: "Probation Completion", triggerType: "event", triggerEvent: "employee.probation_end", cronExpr: null, templateCode: "probation_confirmation", recipients: "employee" },
  { code: "rule_leave_approved", name: "Leave Approved", triggerType: "event", triggerEvent: "leave.approved", cronExpr: null, templateCode: "leave_approved", recipients: "employee" },
  { code: "rule_leave_rejected", name: "Leave Rejected", triggerType: "event", triggerEvent: "leave.rejected", cronExpr: null, templateCode: "leave_rejected", recipients: "employee" },
  { code: "rule_holiday_announcement", name: "Holiday Announcement", triggerType: "event", triggerEvent: "holiday.created", cronExpr: null, templateCode: "holiday_announcement", recipients: "all" },
];

export async function POST() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const seeded: string[] = [];
    const updated: string[] = [];
    const templateIdByCode = new Map<string, string>();

    for (const tmpl of SEED_TEMPLATES) {
      const [existing] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.code, tmpl.code));
      if (existing) {
        // Upsert: refresh subject, body and variables so re-seeding picks up new HTML
        await db.update(emailTemplatesTable)
          .set({ name: tmpl.name, subject: tmpl.subject, bodyHtml: tmpl.bodyHtml, variables: tmpl.variables })
          .where(eq(emailTemplatesTable.code, tmpl.code));
        templateIdByCode.set(tmpl.code, existing.id);
        updated.push(tmpl.code);
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

    return Response.json({ templatesSeeded: seeded, templatesUpdated: updated, rulesSeeded });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
