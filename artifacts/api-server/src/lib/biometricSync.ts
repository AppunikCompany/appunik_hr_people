/**
 * EasyTime Pro (ZKTeco BioTime 8) biometric attendance sync — REST polling.
 *
 * The fingerprint device reports to the EasyTime Pro server; we pull punch
 * transactions from its REST API on an interval and fold them into our own
 * people_attendance_records.
 *
 * Mapping: EasyTime `emp_code` === our employee `employeeCode`.
 * Source of truth: biometric wins for office (WFO) days — a biometric punch
 * overrides a manual web clock-in for the same date. WFH records are left
 * untouched (WFH is manual by nature).
 *
 * Idempotent by design: clockIn is kept as the EARLIEST punch of the day and
 * clockOut as the LATEST, so re-processing the same punch never changes the
 * result. That lets us poll with a time-window cursor + overlap and skip a
 * dedup table entirely.
 *
 * Config (env):
 *   EASYTIME_URL       e.g. http://122.174.67.53:8081
 *   EASYTIME_USER  API user
 *   EASYTIME_PASS  API password
 */

import { db } from "@workspace/db";
import { attendanceRecordsTable, employeesTable, appConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const COMPANY_TIMEZONE = "Asia/Kolkata";
const CURSOR_KEY = "biometric_sync_cursor";       // last processed punch_time (IST "YYYY-MM-DD HH:MM:SS")
const STATUS_KEY = "biometric_sync_status";       // JSON status blob for the HR panel
const OVERLAP_MINUTES = 5;                        // re-scan a small window to avoid boundary misses
const PAGE_SIZE = 200;
const MAX_PAGES = 50;                             // hard stop — 10k punches per run

export interface SyncSummary {
  ok: boolean;
  processed: number;
  created: number;
  updated: number;
  skippedUnmapped: number;
  unmappedCodes: string[];
  lastPunchTime: string | null;
  error?: string;
  ranAt: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
export function biometricConfig() {
  const base = (process.env.EASYTIME_URL ?? "").replace(/\/+$/, "");
  const username = process.env.EASYTIME_USER ?? "";
  const password = process.env.EASYTIME_PASS ?? "";
  return { base, username, password, configured: Boolean(base && username && password) };
}

// ── IST time helpers ────────────────────────────────────────────────────────────
/** Format a Date as "YYYY-MM-DD HH:MM:SS" in IST (the format EasyTime expects/returns). */
function fmtIST(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

/** Parse an EasyTime "YYYY-MM-DD HH:MM:SS" (IST) string into a Date. */
function parseISTPunch(s: string): Date | null {
  const clean = s.trim().replace(" ", "T");
  const d = new Date(clean + "+05:30");
  return isNaN(d.getTime()) ? null : d;
}

/** The IST calendar date (YYYY-MM-DD) for a punch Date. */
function istDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

// ── appConfig helpers ────────────────────────────────────────────────────────────
async function getConfig(key: string): Promise<string | null> {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, key)).limit(1);
  return row?.value ?? null;
}

async function setConfig(key: string, value: string): Promise<void> {
  const [existing] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, key)).limit(1);
  if (existing) {
    await db.update(appConfigTable).set({ value }).where(eq(appConfigTable.id, existing.id));
  } else {
    await db.insert(appConfigTable).values({ key, value });
  }
}

// ── Auth (JWT token, cached in-process) ───────────────────────────────────────────
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(force = false): Promise<string> {
  const { base, username, password, configured } = biometricConfig();
  if (!configured) throw new Error("EasyTime Pro is not configured (set EASYTIME_URL, EASYTIME_USER, EASYTIME_PASS)");

  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const res = await fetch(`${base}/jwt-api-token-auth/`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`EasyTime auth failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("EasyTime auth response did not contain a token");

  // BioTime JWTs are long-lived; cache for 50 minutes and refresh proactively.
  cachedToken = { value: data.token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return data.token;
}

// ── Transaction fetching ──────────────────────────────────────────────────────────
interface RawPunch {
  id: number;
  emp_code: string;
  punch_time: string;         // "YYYY-MM-DD HH:MM:SS" (IST)
  punch_state?: string | number;
  punch_state_display?: string;
}

/** Fetch all transactions with punch_time >= startTime (IST string), following pagination. */
async function fetchTransactions(startTime: string): Promise<RawPunch[]> {
  const { base } = biometricConfig();
  const token = await getToken();
  const out: RawPunch[] = [];

  let url: string | null =
    `${base}/iclock/api/transactions/?page_size=${PAGE_SIZE}&ordering=punch_time` +
    `&start_time=${encodeURIComponent(startTime)}`;

  for (let page = 0; url && page < MAX_PAGES; page++) {
    let res: Response = await fetch(url, {
      headers: { authorization: `JWT ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    // Token expired mid-run — refresh once and retry this page.
    if (res.status === 401) {
      const fresh = await getToken(true);
      res = await fetch(url, {
        headers: { authorization: `JWT ${fresh}`, accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
    }

    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      throw new Error(`EasyTime transactions fetch failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as { data?: RawPunch[]; results?: RawPunch[]; next?: string | null };
    const rows = json.data ?? json.results ?? [];
    out.push(...rows);
    url = json.next ?? null;
  }

  return out;
}

// ── Punch direction ────────────────────────────────────────────────────────────────
// BioTime punch_state: 0/"0" = Check In, 1/"1" = Check Out, others = break/OT.
// We treat 1 and 5 (OT Out) as "out"; everything else as "in".
function isOutPunch(p: RawPunch): boolean {
  const s = String(p.punch_state ?? "").trim();
  if (s === "1" || s === "5") return true;
  const disp = (p.punch_state_display ?? "").toLowerCase();
  return disp.includes("out");
}

// ── Main sync ────────────────────────────────────────────────────────────────────
export async function syncBiometricPunches(): Promise<SyncSummary> {
  const ranAt = new Date().toISOString();
  const summary: SyncSummary = {
    ok: false, processed: 0, created: 0, updated: 0,
    skippedUnmapped: 0, unmappedCodes: [], lastPunchTime: null, ranAt,
  };

  const { configured } = biometricConfig();
  if (!configured) {
    summary.error = "EasyTime Pro not configured";
    return summary;
  }

  try {
    // Cursor: last processed punch_time, minus an overlap window. First run → start of today IST.
    const cursor = await getConfig(CURSOR_KEY);
    let startTime: string;
    if (cursor) {
      const base = parseISTPunch(cursor) ?? new Date();
      startTime = fmtIST(new Date(base.getTime() - OVERLAP_MINUTES * 60000));
    } else {
      startTime = `${istDate(new Date())} 00:00:00`;
    }

    const punches = await fetchTransactions(startTime);

    // Preload employee map: employeeCode → id (+ existing record cache per day)
    const employees = await db
      .select({ id: employeesTable.id, code: employeesTable.employeeCode })
      .from(employeesTable);
    const codeToId = new Map(employees.map((e) => [String(e.code).trim(), e.id] as const));

    const unmapped = new Set<string>();
    let maxPunch: Date | null = null;

    for (const p of punches) {
      const empCode = String(p.emp_code ?? "").trim();
      const when = parseISTPunch(p.punch_time);
      if (!empCode || !when) continue;
      summary.processed++;
      if (!maxPunch || when > maxPunch) maxPunch = when;

      const employeeId = codeToId.get(empCode);
      if (!employeeId) {
        unmapped.add(empCode);
        summary.skippedUnmapped++;
        continue;
      }

      const date = istDate(when);
      const out = isOutPunch(p);

      const [existing] = await db
        .select()
        .from(attendanceRecordsTable)
        .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, date)))
        .limit(1);

      if (!existing) {
        await db.insert(attendanceRecordsTable).values({
          employeeId, date, type: "wfo", source: "biometric",
          clockIn: out ? null : when,
          clockOut: out ? when : null,
          isLate: false, isHalfDay: false,
        });
        summary.created++;
        continue;
      }

      // WFH stays manual — never overwrite a WFH record from a biometric punch.
      if (existing.type === "wfh") continue;

      // Biometric wins for WFO: if this record was a manual web entry, take it over.
      const takingOver = existing.source !== "biometric";
      let clockIn = takingOver ? null : existing.clockIn;
      let clockOut = takingOver ? null : existing.clockOut;

      // Keep earliest in, latest out (idempotent).
      if (out) {
        if (!clockOut || when > new Date(clockOut)) clockOut = when;
      } else {
        if (!clockIn || when < new Date(clockIn)) clockIn = when;
      }

      // Recompute derived fields when both ends are known.
      let hoursWorked = existing.hoursWorked;
      let isHalfDay = existing.isHalfDay;
      if (clockIn && clockOut) {
        const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
        hoursWorked = Math.max(0, ms / 3_600_000);
        isHalfDay = hoursWorked < 4;
      }

      await db
        .update(attendanceRecordsTable)
        .set({ clockIn, clockOut, hoursWorked, isHalfDay, isLate: false, source: "biometric", type: "wfo" })
        .where(eq(attendanceRecordsTable.id, existing.id));
      summary.updated++;
    }

    // Advance the cursor to the newest punch we saw (only forward).
    if (maxPunch) {
      const newCursor = fmtIST(maxPunch);
      if (!cursor || newCursor > cursor) await setConfig(CURSOR_KEY, newCursor);
      summary.lastPunchTime = fmtIST(maxPunch);
    } else if (cursor) {
      summary.lastPunchTime = cursor;
    }

    summary.unmappedCodes = [...unmapped].sort();
    summary.ok = true;
  } catch (e) {
    summary.error = String(e instanceof Error ? e.message : e);
  }

  await setConfig(STATUS_KEY, JSON.stringify(summary)).catch(() => {});
  return summary;
}

/** Last saved sync status, for the HR panel. */
export async function getBiometricStatus(): Promise<SyncSummary | null> {
  const raw = await getConfig(STATUS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as SyncSummary; } catch { return null; }
}

/** Quick auth check for the "Test connection" button. */
export async function testBiometricConnection(): Promise<{ ok: boolean; error?: string }> {
  const { configured } = biometricConfig();
  if (!configured) return { ok: false, error: "EasyTime Pro not configured (set EASYTIME_URL, EASYTIME_USER, EASYTIME_PASS)" };
  try {
    await getToken(true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}
