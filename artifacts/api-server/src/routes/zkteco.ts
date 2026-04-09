/**
 * ZKTeco SA40 Biometric Integration — ADMS Push Protocol
 *
 * The device pushes punch records automatically to /iclock/cdata.
 * Configure on the device: Comm → Cloud Server → Server = <this-server-ip>, Port = 3001
 *
 * Punch records are written directly to the existing attendance_records table.
 * No ZKTeco-specific UI — punches appear as normal attendance entries.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  zktecoPunchLogsTable,
  attendanceRecordsTable,
  employeesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

// ZKTeco inout code → punch direction
const INOUT: Record<number, "in" | "out"> = {
  0: "in",   // Check In
  1: "out",  // Check Out
  2: "out",  // Break Out
  3: "in",   // Break In
  4: "in",   // OT In
  5: "out",  // OT Out
};

const VERIFY: Record<number, string> = {
  1: "fingerprint",
  3: "password",
  4: "card",
  15: "face",
};

// ─────────────────────────────────────────────────────────────────────────────
//  Core handler — shared by GET and POST /iclock/cdata
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAdmsPush(req: Request, res: Response) {
  const { table } = req.query as Record<string, string>;

  // ── Device options request (GET with no table param) ─────────────────────
  // Device sends this on startup to get server time and sync settings
  if (req.method === "GET" && !table) {
    res.set("Content-Type", "text/plain");
    return res.send(
      "GET OPTION FROM: 0\n" +
      "ATTLOGStamp=9999\n" +
      "OPERLOGStamp=9999\n" +
      "ATTPHOTOStamp=None\n" +
      "ErrorDelay=30\n" +
      "Delay=10\n" +
      "TransTimes=00:00;14:05\n" +
      "TransInterval=1\n" +
      "TransFlag=TransData AttLog\n" +
      "TimeZone=5.5\n" +
      "Realtime=1\n" +
      "Encrypt=None"
    );
  }

  // ── Attendance log push (POST, table=ATTLOG) ──────────────────────────────
  if (table === "ATTLOG") {
    // Body format per line: MEMBERNO\tDATETIME\tVERIFY\tINOUT\tWORKCODE
    const body: string = typeof req.body === "string" ? req.body : "";
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      try {
        const parts = line.split("\t");
        if (parts.length < 2) continue;

        const memberId    = parseInt(parts[0] ?? "0", 10);
        const punchTime   = (parts[1] ?? "").trim();              // "YYYY-MM-DD HH:MM:SS"
        const verifyCode  = parseInt(parts[2] ?? "1",  10);
        const inOutCode   = parseInt(parts[3] ?? "0",  10);

        if (isNaN(memberId) || memberId < 1 || !punchTime) continue;

        const punchType   = INOUT[inOutCode]   ?? "in";
        const verifyMethod = VERIFY[verifyCode] ?? "fingerprint";

        // ── Deduplication — skip if already processed ────────────────────
        const [exists] = await db
          .select({ id: zktecoPunchLogsTable.id })
          .from(zktecoPunchLogsTable)
          .where(and(
            eq(zktecoPunchLogsTable.memberId,  memberId),
            eq(zktecoPunchLogsTable.punchTime, punchTime)
          ))
          .limit(1);

        if (exists) continue;

        // ── Find employee by Member ID (MEM 1 = zktecoMemberId 1) ────────
        const [employee] = await db
          .select({ id: employeesTable.id })
          .from(employeesTable)
          .where(eq(employeesTable.zktecoMemberId, memberId))
          .limit(1);

        if (!employee) {
          console.warn(`[ZKTeco] MEM ${memberId} not mapped to any employee — skipping`);
          // Still log the punch so we don't re-process it
          await db.insert(zktecoPunchLogsTable).values({
            id: crypto.randomUUID(), memberId, punchTime, punchType, verifyMethod,
          }).onDuplicateKeyUpdate({ set: { punchType } });
          continue;
        }

        // ── Record the punch (dedup log) ─────────────────────────────────
        await db.insert(zktecoPunchLogsTable).values({
          id: crypto.randomUUID(), memberId, punchTime, punchType, verifyMethod,
        }).onDuplicateKeyUpdate({ set: { punchType } });

        // ── Parse date + time ────────────────────────────────────────────
        const [datePart] = punchTime.split(" ");
        if (!datePart) continue;
        const punchDate = new Date(punchTime.replace(" ", "T"));

        // ── Upsert attendance record ──────────────────────────────────────
        const [existing] = await db
          .select()
          .from(attendanceRecordsTable)
          .where(and(
            eq(attendanceRecordsTable.employeeId, employee.id),
            eq(attendanceRecordsTable.date,       datePart)
          ))
          .limit(1);

        if (!existing) {
          // First punch of the day → create record as clock-in
          const isLate = punchType === "in" && (punchDate.getHours() > 9 || (punchDate.getHours() === 9 && punchDate.getMinutes() > 30));
          await db.insert(attendanceRecordsTable).values({
            id:         crypto.randomUUID(),
            employeeId: employee.id,
            date:       datePart,
            clockIn:    punchType === "in"  ? punchDate : null,
            clockOut:   punchType === "out" ? punchDate : null,
            type:       "wfo",
            isLate,
            notes:      `Biometric — ${verifyMethod}`,
          });
        } else {
          // Subsequent punch → fill in clockOut or update clockIn
          if (punchType === "in" && !existing.clockIn) {
            const isLate = punchDate.getHours() > 9 || (punchDate.getHours() === 9 && punchDate.getMinutes() > 30);
            await db.update(attendanceRecordsTable)
              .set({ clockIn: punchDate, isLate })
              .where(eq(attendanceRecordsTable.id, existing.id));
          } else if (punchType === "out") {
            const clockInTime = existing.clockIn ? new Date(existing.clockIn) : null;
            const hoursWorked = clockInTime
              ? (punchDate.getTime() - clockInTime.getTime()) / 3_600_000
              : null;
            const isHalfDay = hoursWorked !== null && hoursWorked < 4;
            await db.update(attendanceRecordsTable)
              .set({ clockOut: punchDate, hoursWorked, isHalfDay })
              .where(eq(attendanceRecordsTable.id, existing.id));
          }
        }

        console.log(`[ZKTeco] MEM ${memberId} → emp ${employee.id} | ${punchType} at ${punchTime}`);
      } catch (err) {
        console.error("[ZKTeco] Error processing punch line:", line, err);
      }
    }

    return res.send("OK");
  }

  // ── All other table types (OPERLOG, etc.) — acknowledge silently ──────────
  return res.send("OK");
}

// GET /iclock/ping — heartbeat (mounted in app.ts)
router.get("/zkteco/ping", (_req, res) => res.send("OK"));

export default router;
