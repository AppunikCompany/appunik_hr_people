/**
 * Scheduled notification jobs — called by the daily IST scheduler in app.ts.
 */

import { db, employeesTable, attendanceRecordsTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { notifyUser } from "./notify";
import { fireAutomationEvent } from "./automations";

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

// ── Clock-in reminder (runs at 10:15 AM IST) ─────────────────────────────────
export async function notifyForgottenClockIn(): Promise<void> {
  if (isTodayWeekendIST()) {
    console.log("[scheduled] Clock-in reminder: skipping — weekend");
    return;
  }
  try {
    const today = todayIST();

    const [activeEmps, todayRecords] = await Promise.all([
      db.select({ id: employeesTable.id, userId: employeesTable.userId })
        .from(employeesTable)
        .where(inArray(employeesTable.status, ["active", "probation"])),
      db.select({ employeeId: attendanceRecordsTable.employeeId })
        .from(attendanceRecordsTable)
        .where(eq(attendanceRecordsTable.date, today)),
    ]);

    const checkedInIds = new Set(todayRecords.map((r) => r.employeeId));
    let notified = 0;

    for (const emp of activeEmps) {
      if (checkedInIds.has(emp.id) || !emp.userId) continue;
      await notifyUser(emp.userId, {
        type: "attendance.clock_in_reminder",
        title: "Don't forget to clock in! ⏰",
        body: "You haven't clocked in yet today. Please clock in or mark WFH.",
        link: "/attendance/my",
      });
      // Also fire automation event so any active email rule is triggered
      await fireAutomationEvent({ event: "attendance.clock_in_reminder", employeeId: emp.id }).catch(() => {});
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

    // Find WFO records for today that have clockIn but no clockOut
    const allToday = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.date, today), eq(attendanceRecordsTable.type, "wfo")));

    const empIdsNeedingClockOut = allToday
      .filter((r) => r.clockIn && !r.clockOut)
      .map((r) => r.employeeId);

    if (empIdsNeedingClockOut.length === 0) {
      console.log("[scheduled] Clock-out reminder: everyone already clocked out");
      return;
    }

    const emps = await db
      .select({ id: employeesTable.id, userId: employeesTable.userId })
      .from(employeesTable)
      .where(inArray(employeesTable.id, empIdsNeedingClockOut));

    let notified = 0;
    for (const emp of emps) {
      if (!emp.userId) continue;
      await notifyUser(emp.userId, {
        type: "attendance.clock_out_reminder",
        title: "Don't forget to clock out! ⏰",
        body: "Your shift is ending. Please clock out to record your hours for today.",
        link: "/attendance/my",
      });
      // Also fire automation event so any active email rule is triggered
      await fireAutomationEvent({ event: "attendance.clock_out_reminder", employeeId: emp.id }).catch(() => {});
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

    // All userIds to notify (recipients)
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

    // Broadcast each birthday to all employees
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

    // Broadcast each work anniversary to all employees
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
