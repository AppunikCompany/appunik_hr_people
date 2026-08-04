/**
 * ZKTeco SA40 Biometric Integration — ADMS Push Protocol
 *
 * The device pushes punch records automatically to /iclock/cdata.
 * Configure on the device: Comm → Cloud Server → Server = <this-server-ip>, Port = 3001
 *
 * Punches are stored as raw rows in biometricPunchLogsTable. Attendance is
 * re-derived from those punches (same pipeline as EasyTime Pro API poll).
 * This handler does NOT write to attendanceRecordsTable directly.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import {
  storeRawPunch,
  nextAdmsEasyTimeId,
  parseISTPunch,
  reDeriveAttendanceForDay,
  buildEmployeeCodeMap,
  resolveEmployeeId,
} from "../lib/biometricSync";

const router: IRouter = Router();

const VERIFY: Record<number, number> = {
  1: 1,   // fingerprint
  3: 3,   // password
  4: 4,   // card
  15: 15, // face
};

// ─────────────────────────────────────────────────────────────────────────────
//  Core handler — shared by GET and POST /iclock/cdata
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAdmsPush(req: Request, res: Response) {
  const { table } = req.query as Record<string, string>;

  // ── Device options request (GET with no table param) ─────────────────────
  if (req.method === "GET" && !table) {
    console.log(`[ZKTeco] Device handshake from ${req.ip} | UA: ${req.headers["user-agent"] ?? "none"}`);
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
    let body: string = "";
    if (typeof req.body === "string") {
      body = req.body;
    } else if (req.body && typeof req.body === "object") {
      body = Object.keys(req.body).join("\n");
    }
    console.log(`[ZKTeco] POST ATTLOG — Content-Type: ${req.headers["content-type"] ?? "none"} | body length: ${body.length} | body: ${JSON.stringify(body.slice(0, 200))}`);
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);

    const codeMap = await buildEmployeeCodeMap();
    const affected = new Map<string, { employeeId: string; date: string }>();

    for (const line of lines) {
      try {
        const parts = line.split("\t");
        if (parts.length < 2) continue;

        // Store emp code as string — do NOT parseInt (codes like MEM30, JAYESH)
        const empCode = (parts[0] ?? "").trim();
        const punchTimeStr = (parts[1] ?? "").trim(); // "YYYY-MM-DD HH:MM:SS" IST
        const verifyCode = parseInt(parts[2] ?? "1", 10);
        const inOutCode = parseInt(parts[3] ?? "255", 10);

        if (!empCode || !punchTimeStr) continue;

        const punchTime = parseISTPunch(punchTimeStr);
        if (!punchTime) continue;

        const punchState = Number.isFinite(inOutCode) ? inOutCode : 255;
        const easyTimeId = await nextAdmsEasyTimeId();

        const result = await storeRawPunch({
          easyTimeId,
          empCode,
          punchTime,
          punchState,
          verifyType: VERIFY[verifyCode] ?? verifyCode ?? 1,
          codeMap,
        });

        if (result.inserted && result.employeeId && result.date) {
          const key = `${result.employeeId}|${result.date}`;
          affected.set(key, { employeeId: result.employeeId, date: result.date });
          console.log(`[ZKTeco] ${empCode} → emp ${result.employeeId} | punch at ${punchTimeStr}`);
        } else if (result.reason === "visitor") {
          console.log(`[ZKTeco] Skipping visitor code: ${empCode}`);
        } else if (result.inserted && !result.employeeId) {
          console.warn(`[ZKTeco] Stored unmapped emp code "${empCode}" at ${punchTimeStr}`);
        } else if (result.reason === "dup_emp_time" || result.reason === "dup_id" || result.reason === "dup_constraint") {
          // Already ingested (likely via API poll) — still try re-derive if we can resolve the employee
          const empId = resolveEmployeeId(empCode, codeMap);
          if (empId) {
            const datePart = punchTimeStr.split(" ")[0];
            if (datePart) affected.set(`${empId}|${datePart}`, { employeeId: empId, date: datePart });
          }
        }
      } catch (err) {
        console.error("[ZKTeco] Error processing punch line:", line, err);
      }
    }

    // Re-derive attendance for affected employee+date pairs
    for (const { employeeId, date } of affected.values()) {
      try {
        await reDeriveAttendanceForDay(employeeId, date);
      } catch (err) {
        console.error(`[ZKTeco] Re-derive failed for ${employeeId} ${date}:`, err);
      }
    }

    return res.send("OK");
  }

  // ── All other table types (OPERLOG, etc.) — acknowledge silently ──────────
  return res.send("OK");
}

router.get("/zkteco/ping", (_req, res) => res.send("OK"));

export default router;
