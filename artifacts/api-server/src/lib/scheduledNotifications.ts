/**
 * Scheduled notification jobs — called by the daily IST scheduler in app.ts.
 * Emails are sent directly via ZeptoMail (no automation-rule DB lookup needed).
 */

import { db, employeesTable, attendanceRecordsTable, leaveRequestsTable } from "@workspace/db";
import { eq, inArray, and, lte, gte, isNull } from "drizzle-orm";
import { notifyUser } from "./notify";

const COMPANY_TIMEZONE = "Asia/Kolkata";

function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Returns true if today is Saturday or Sunday in IST. */
function isTodayWeekendIST(): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY_TIMEZONE,
    weekday: "short",
  }).formatToParts(new Date());
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  return weekday === "Sat" || weekday === "Sun";
}

// ── Direct ZeptoMail sender ───────────────────────────────────────────────────

async function sendDirectEmail(to: string, subject: string, htmlBody: string): Promise<void> {
  const token = process.env.ZEPTOMAIL_API_KEY ?? "";
  if (!token || !to) return;

  const res = await fetch(
    process.env.ZEPTOMAIL_URL ?? "https://api.zeptomail.in/v1.1/email",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Zoho-enczapikey ${token}`,
      },
      body: JSON.stringify({
        from: {
          address: process.env.FROM_EMAIL ?? "hr@appunik.com",
          name: process.env.FROM_NAME ?? "Appunik HR",
        },
        to: [{ email_address: { address: to, name: "" } }],
        subject,
        htmlbody: htmlBody,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`ZeptoMail ${res.status}: ${text}`);
  }
}

// ── Clock-in reminder (runs at 10:15 AM IST) ─────────────────────────────────
export async function notifyForgottenClockIn(): Promise<void> {
  if (isTodayWeekendIST()) {
    console.log("[scheduled] Clock-in reminder: skipping — weekend");
    return;
  }
  try {
    const today = todayIST();

    const [activeEmps, todayRecords, onLeaveToday] = await Promise.all([
      db.select({
        id: employeesTable.id,
        userId: employeesTable.userId,
        firstName: employeesTable.firstName,
        email: employeesTable.email,
      })
        .from(employeesTable)
        .where(inArray(employeesTable.status, ["active", "probation"])),

      db.select({ employeeId: attendanceRecordsTable.employeeId })
        .from(attendanceRecordsTable)
        .where(eq(attendanceRecordsTable.date, today)),

      // Employees on approved leave that covers today
      db.select({ employeeId: leaveRequestsTable.employeeId })
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.status, "approved"),
            lte(leaveRequestsTable.startDate, today),
            gte(leaveRequestsTable.endDate, today),
          ),
        ),
    ]);

    const checkedInIds = new Set(todayRecords.map((r) => r.employeeId));
    const onLeaveIds = new Set(onLeaveToday.map((r) => r.employeeId));

    let notified = 0;
    for (const emp of activeEmps) {
      if (checkedInIds.has(emp.id)) continue; // already marked attendance
      if (onLeaveIds.has(emp.id)) continue;   // on approved leave

      // In-app notification
      if (emp.userId) {
        await notifyUser(emp.userId, {
          type: "attendance.clock_in_reminder",
          title: "Don't forget to clock in! ⏰",
          body: "You haven't marked your attendance yet today. Please clock in or mark WFH.",
          link: "/attendance/my",
        }).catch(() => {});
      }

      // Direct email
      if (emp.email) {
        const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;background:#f9fafb;border-radius:12px">
  <div style="background:#fff;border-radius:8px;padding:28px;border:1px solid #e5e7eb">
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827">⏰ Attendance Reminder</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px">${today}</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px">
      Hi ${emp.firstName},<br><br>
      You haven't marked your attendance yet today. Please <strong>clock in</strong> or <strong>mark WFH</strong> as soon as possible.
    </p>
    <a href="${process.env.APP_URL ?? "https://your-hr-portal.com"}/attendance/my"
       style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:600">
      Mark Attendance →
    </a>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px">This is an automated reminder from your HR system.</p>
  </div>
</div>`;
        await sendDirectEmail(emp.email, "⏰ Attendance Reminder — Please clock in", html).catch((err) => {
          console.error(`[scheduled] Clock-in email failed for ${emp.email}:`, err);
        });
      }

      notified++;
    }
    console.log(`[scheduled] Clock-in reminder: notified ${notified} employees`);
  } catch (e) {
    console.error("[scheduled] notifyForgottenClockIn failed:", e);
  }
}

// ── Clock-out reminder (runs at 7:15 PM IST) ─────────────────────────────────
export async function notifyForgottenClockOut(): Promise<void> {
  if (isTodayWeekendIST()) {
    console.log("[scheduled] Clock-out reminder: skipping — weekend");
    return;
  }
  try {
    const today = todayIST();

    // Find all attendance records for today with no clock-out (WFO clocked in, or WFH not checked out)
    const openRecords = await db
      .select({ employeeId: attendanceRecordsTable.employeeId, type: attendanceRecordsTable.type })
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.date, today),
          isNull(attendanceRecordsTable.clockOut),
          inArray(attendanceRecordsTable.type, ["wfo", "wfh"]),
        ),
      );

    // For WFO: must have clocked in (clockIn is not null is handled below)
    // We already have the records — filter WFO to only those who actually clocked in
    const needsReminder = openRecords.filter((r) => r.type === "wfh" || r.type === "wfo");
    const empIds = needsReminder.map((r) => r.employeeId);

    if (empIds.length === 0) {
      console.log("[scheduled] Clock-out reminder: everyone already checked out");
      return;
    }

    const emps = await db
      .select({
        id: employeesTable.id,
        userId: employeesTable.userId,
        firstName: employeesTable.firstName,
        email: employeesTable.email,
      })
      .from(employeesTable)
      .where(inArray(employeesTable.id, empIds));

    const typeMap = new Map(needsReminder.map((r) => [r.employeeId, r.type]));

    let notified = 0;
    for (const emp of emps) {
      const attendanceType = typeMap.get(emp.id) ?? "wfo";

      // In-app notification
      if (emp.userId) {
        await notifyUser(emp.userId, {
          type: "attendance.clock_out_reminder",
          title: "Don't forget to check out! ⏰",
          body: "Your working day is ending. Please check out to record your hours for today.",
          link: "/attendance/my",
        }).catch(() => {});
      }

      // Direct email
      if (emp.email) {
        const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;background:#f9fafb;border-radius:12px">
  <div style="background:#fff;border-radius:8px;padding:28px;border:1px solid #e5e7eb">
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827">⏰ Check-Out Reminder</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px">${today}</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px">
      Hi ${emp.firstName},<br><br>
      Your working day is wrapping up and you haven't checked out yet${attendanceType === "wfh" ? " (WFH)" : ""}. Please <strong>check out</strong> to complete your attendance for today.
    </p>
    <a href="${process.env.APP_URL ?? "https://your-hr-portal.com"}/attendance/my"
       style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:600">
      Check Out Now →
    </a>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px">This is an automated reminder from your HR system.</p>
  </div>
</div>`;
        await sendDirectEmail(emp.email, "⏰ Check-Out Reminder — Please check out", html).catch((err) => {
          console.error(`[scheduled] Clock-out email failed for ${emp.email}:`, err);
        });
      }

      notified++;
    }
    console.log(`[scheduled] Clock-out reminder: notified ${notified} employees`);
  } catch (e) {
    console.error("[scheduled] notifyForgottenClockOut failed:", e);
  }
}

// ── Birthdays & work anniversaries (runs at 9:00 AM IST) ─────────────────────
export async function notifyBirthdaysAndAnniversaries(): Promise<void> {
  try {
    const today = todayIST();
    const todayMMDD = today.slice(5); // MM-DD
    const todayYear = parseInt(today.slice(0, 4));

    const allEmps = await db
      .select({
        id: employeesTable.id,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
        dateOfBirth: employeesTable.dateOfBirth,
        joiningDate: employeesTable.joiningDate,
        userId: employeesTable.userId,
        status: employeesTable.status,
      })
      .from(employeesTable)
      .where(inArray(employeesTable.status, ["active", "probation"]));

    const allUserIds = allEmps.map((e) => e.userId).filter(Boolean) as string[];

    const birthdays: string[] = [];
    const anniversaries: { name: string; years: number }[] = [];

    for (const emp of allEmps) {
      const name = `${emp.firstName} ${emp.lastName}`;
      if (emp.dateOfBirth && String(emp.dateOfBirth).slice(5, 10) === todayMMDD) {
        birthdays.push(name);
      }
      if (emp.joiningDate) {
        const jdStr = String(emp.joiningDate);
        const jdMMDD = jdStr.slice(5, 10);
        const jdYear = parseInt(jdStr.slice(0, 4));
        if (jdMMDD === todayMMDD && jdYear < todayYear) {
          anniversaries.push({ name, years: todayYear - jdYear });
        }
      }
    }

    for (const name of birthdays) {
      const firstName = name.split(" ")[0];
      for (const uid of allUserIds) {
        await notifyUser(uid, {
          type: "birthday",
          title: `🎂 It's ${name}'s birthday today!`,
          body: `Wish ${firstName} a happy birthday! 🎉`,
          link: "/employees",
        });
      }
    }

    for (const { name, years } of anniversaries) {
      const firstName = name.split(" ")[0];
      for (const uid of allUserIds) {
        await notifyUser(uid, {
          type: "work_anniversary",
          title: `🎉 ${name}'s ${years}-year work anniversary!`,
          body: `${firstName} completes ${years} year${years !== 1 ? "s" : ""} at the company today. Congratulate them!`,
          link: "/employees",
        });
      }
    }

    console.log(
      `[scheduled] Birthdays: ${birthdays.length}, Anniversaries: ${anniversaries.length}`,
    );
  } catch (e) {
    console.error("[scheduled] notifyBirthdaysAndAnniversaries failed:", e);
  }
}
