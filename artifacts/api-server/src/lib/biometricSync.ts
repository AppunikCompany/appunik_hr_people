/**
 * EasyTime Pro (ZKTeco BioTime 8) biometric attendance sync.
 *
 * Pipeline:
 *   1. FETCH transactions (id-based cursor)
 *   2. STORE raw punches into biometricPunchLogsTable
 *   3. COLLECT affected (employeeId, date) pairs
 *   4. RE-DERIVE attendance + breaks from ALL raw punches for those days
 *   5. UPDATE cursor + status
 *
 * Raw punch log is the source of truth. attendanceRecordsTable is derived.
 *
 * Config (env):
 *   EASYTIME_URL   e.g. http://122.174.67.53:8081
 *   EASYTIME_USER  API user
 *   EASYTIME_PASS  API password
 */

import { db } from "@workspace/db";
import {
  attendanceRecordsTable,
  attendanceBreaksTable,
  biometricPunchLogsTable,
  employeesTable,
  appConfigTable,
} from "@workspace/db";
import { eq, and, gte, lt, isNull, asc } from "drizzle-orm";

const COMPANY_TIMEZONE = "Asia/Kolkata";
const CURSOR_KEY = "biometric_sync_cursor_id"; // last processed easyTimeId
const STATUS_KEY = "biometric_sync_status";
const PAGE_SIZE = 200;
const MAX_PAGES = 100;
const DEDUP_WINDOW_MS = 3 * 60 * 1000; // 3-minute collapse window
const MIN_BREAK_MINUTES = 5;

export interface SyncSummary {
  ok: boolean;
  processed: number;
  created: number;
  updated: number;
  skippedUnmapped: number;
  unmappedCodes: string[];
  lastPunchTime: string | null;
  sessionsCreated: number;
  breaksCreated: number;
  daysReprocessed: number;
  error?: string;
  ranAt: string;
}

export interface PunchEvent {
  time: Date;
  punchState: number;
  verifyType: number;
  direction: "in" | "out" | "break_out" | "break_in" | "ot_in" | "ot_out" | "unknown";
}

export interface SessionPair {
  in: Date;
  out: Date | null;
  durationMinutes: number | null;
}

export interface DerivedDay {
  clockIn: Date | null;
  clockOut: Date | null;
  hoursWorked: number | null;
  isHalfDay: boolean;
  sessions: SessionPair[];
  breaks: { breakStart: Date; breakEnd: Date; durationMinutes: number }[];
  punchLogs: PunchEvent[];
  mode: "explicit" | "inferred";
}

// ── Config ────────────────────────────────────────────────────────────────────
export function biometricConfig() {
  const base = (process.env.EASYTIME_URL ?? "").replace(/\/+$/, "");
  const username = process.env.EASYTIME_USER ?? "";
  const password = process.env.EASYTIME_PASS ?? "";
  return { base, username, password, configured: Boolean(base && username && password) };
}

// ── IST helpers ───────────────────────────────────────────────────────────────
function fmtIST(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

export function parseISTPunch(s: string): Date | null {
  const clean = s.trim().replace(" ", "T");
  const d = new Date(clean + "+05:30");
  return isNaN(d.getTime()) ? null : d;
}

export function istDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** Start of an IST calendar day as a UTC Date. */
function istDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+05:30`);
}

/** Start of the next IST calendar day as a UTC Date. */
function istDayEndExclusive(dateStr: string): Date {
  const start = istDayStart(dateStr);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

// ── appConfig helpers ─────────────────────────────────────────────────────────
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

// ── Auth (JWT token, cached in-process) ───────────────────────────────────────
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

  const data = (await res.json()) as { access?: string; token?: string };
  const token = data.access ?? data.token;
  if (!token) throw new Error("EasyTime auth response did not contain a token");

  cachedToken = { value: token, expiresAt: Date.now() + 4 * 60 * 1000 };
  return token;
}

// ── Transaction fetching ──────────────────────────────────────────────────────
interface RawPunch {
  id: number;
  emp_code: string;
  punch_time: string;
  punch_state?: string | number;
  verify_type?: number;
  terminal_sn?: string;
  terminal_alias?: string;
  is_attendance?: number;
  source?: number;
}

async function fetchNewTransactions(cursorId: number): Promise<RawPunch[]> {
  const { base } = biometricConfig();
  const token = await getToken();
  const out: RawPunch[] = [];

  // Prefer id__gt (DRF filter). Bound with start_time so an unsupported id__gt
  // cannot force a full historical scan. First run: start of today IST.
  let url: string | null;
  if (cursorId > 0) {
    const startBound = fmtIST(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
    url =
      `${base}/iclock/api/transactions/?page_size=${PAGE_SIZE}&ordering=id` +
      `&id__gt=${cursorId}&start_time=${encodeURIComponent(startBound)}`;
  } else {
    const startTime = `${istDate(new Date())} 00:00:00`;
    url =
      `${base}/iclock/api/transactions/?page_size=${PAGE_SIZE}&ordering=id` +
      `&start_time=${encodeURIComponent(startTime)}`;
  }

  for (let page = 0; url && page < MAX_PAGES; page++) {
    let res: Response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    if (res.status === 401) {
      const fresh = await getToken(true);
      res = await fetch(url, {
        headers: { authorization: `Bearer ${fresh}`, accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
    }

    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      throw new Error(`EasyTime transactions fetch failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as { data?: RawPunch[]; results?: RawPunch[]; next?: string | null };
    const rows = json.data ?? json.results ?? [];
    for (const row of rows) {
      if (Number(row.id) > cursorId) out.push(row);
    }
    url = json.next ?? null;
  }

  return out;
}

// ── Employee-code matching ────────────────────────────────────────────────────
export function normalizeCode(code: string): string {
  const digits = code.replace(/\D/g, "").replace(/^0+/, "");
  return digits || code.trim().toUpperCase();
}

export type EmployeeCodeMap = {
  byExact: Map<string, string>;   // lowercased code → employeeId
  byDigits: Map<string, string>;  // digit-normalized → employeeId
};

export async function buildEmployeeCodeMap(): Promise<EmployeeCodeMap> {
  const employees = await db
    .select({ id: employeesTable.id, code: employeesTable.employeeCode })
    .from(employeesTable);

  const byExact = new Map<string, string>();
  const byDigits = new Map<string, string>();
  for (const e of employees) {
    const raw = String(e.code ?? "").trim();
    if (!raw) continue;
    byExact.set(raw.toLowerCase(), e.id);
    const norm = normalizeCode(raw);
    if (!byDigits.has(norm)) byDigits.set(norm, e.id);
  }
  return { byExact, byDigits };
}

export function resolveEmployeeId(empCode: string, map: EmployeeCodeMap): string | null {
  const trimmed = empCode.trim();
  if (!trimmed) return null;
  return map.byExact.get(trimmed.toLowerCase())
    ?? map.byDigits.get(normalizeCode(trimmed))
    ?? null;
}

export function isVisitorCode(empCode: string): boolean {
  return empCode.trim().toUpperCase().startsWith("VISITOR");
}

/** Allocate a unique negative easyTimeId for ADMS-push punches (avoids API id collisions). */
export async function nextAdmsEasyTimeId(): Promise<number> {
  const key = "biometric_adms_id_seq";
  const raw = await getConfig(key);
  const next = (raw ? parseInt(raw, 10) : 0) - 1; // -1, -2, -3, ...
  if (!Number.isFinite(next) || next >= 0) {
    await setConfig(key, "-1");
    return -1;
  }
  await setConfig(key, String(next));
  return next;
}

/** @deprecated Prefer nextAdmsEasyTimeId — kept for stable tests / callers */
export function syntheticEasyTimeId(empCode: string, punchTimeIst: string): number {
  let hash = 0;
  const s = `${empCode}|${punchTimeIst}`;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  const n = hash === 0 ? -1 : hash > 0 ? -hash : hash;
  return n;
}

// ── Dedup + session derivation (pure) ─────────────────────────────────────────
const EXPLICIT_STATES = new Set([0, 1, 2, 3, 4, 5]);

function collapseWithinWindow(times: Date[], windowMs: number): Date[] {
  if (times.length === 0) return [];
  const sorted = [...times].sort((a, b) => a.getTime() - b.getTime());
  const kept: Date[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const prev = kept[kept.length - 1]!;
    if (cur.getTime() - prev.getTime() > windowMs) kept.push(cur);
  }
  return kept;
}

function directionFromState(state: number): PunchEvent["direction"] {
  switch (state) {
    case 0: return "in";
    case 1: return "out";
    case 2: return "break_out";
    case 3: return "break_in";
    case 4: return "ot_in";
    case 5: return "ot_out";
    default: return "unknown";
  }
}

function shouldAutoCloseAt(date: string): Date | null {
  const closeAt = new Date(`${date}T22:00:00+05:30`);
  const today = istDate(new Date());
  if (date < today) return closeAt;
  if (date === today && Date.now() >= closeAt.getTime()) return closeAt;
  return null;
}

/**
 * Derive sessions / breaks / attendance fields from ordered raw punches for one day.
 * `date` (YYYY-MM-DD IST) enables auto-close of open sessions after 22:00.
 */
export function deriveDayFromPunches(
  punches: { punchTime: Date; punchState: number; verifyType: number }[],
  date?: string,
): DerivedDay {
  const sorted = [...punches].sort(
    (a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime(),
  );

  if (sorted.length === 0) {
    return {
      clockIn: null, clockOut: null, hoursWorked: null, isHalfDay: false,
      sessions: [], breaks: [], punchLogs: [], mode: "inferred",
    };
  }

  const day = date ?? istDate(new Date(sorted[0]!.punchTime));
  const states = sorted.map((p) => Number(p.punchState));
  const useExplicit = states.some((s) => EXPLICIT_STATES.has(s));

  if (useExplicit) {
    return deriveExplicit(sorted, day);
  }
  return deriveInferred(sorted, day);
}

function deriveInferred(
  punches: { punchTime: Date; punchState: number; verifyType: number }[],
  date: string,
): DerivedDay {
  const times = punches.map((p) => new Date(p.punchTime));
  const deduped = collapseWithinWindow(times, DEDUP_WINDOW_MS);

  const punchLogs: PunchEvent[] = deduped.map((t, idx) => {
    const raw = punches.find((p) => new Date(p.punchTime).getTime() === t.getTime()) ?? punches[0]!;
    const direction: PunchEvent["direction"] = idx % 2 === 0 ? "in" : "out";
    return {
      time: t,
      punchState: Number(raw.punchState),
      verifyType: Number(raw.verifyType ?? 1),
      direction,
    };
  });

  const sessions: SessionPair[] = [];
  for (let i = 0; i < deduped.length; i += 2) {
    const inTime = deduped[i]!;
    const outTime = deduped[i + 1] ?? null;
    const durationMinutes = outTime
      ? (outTime.getTime() - inTime.getTime()) / 60_000
      : null;
    sessions.push({ in: inTime, out: outTime, durationMinutes });
  }

  return finalizeDerived(sessions, punchLogs, "inferred", date);
}

function deriveExplicit(
  punches: { punchTime: Date; punchState: number; verifyType: number }[],
  date: string,
): DerivedDay {
  const punchLogs: PunchEvent[] = punches.map((p) => ({
    time: new Date(p.punchTime),
    punchState: Number(p.punchState),
    verifyType: Number(p.verifyType ?? 1),
    direction: directionFromState(Number(p.punchState)),
  }));

  const sessions: SessionPair[] = [];
  const breaks: DerivedDay["breaks"] = [];
  let openIn: Date | null = null;
  let openBreakOut: Date | null = null;

  for (const p of punchLogs) {
    const state = p.punchState;
    if (state === 0 || state === 4) {
      if (openIn) {
        sessions.push({ in: openIn, out: null, durationMinutes: null });
      }
      openIn = p.time;
    } else if (state === 1 || state === 5) {
      if (openIn) {
        const durationMinutes = (p.time.getTime() - openIn.getTime()) / 60_000;
        sessions.push({ in: openIn, out: p.time, durationMinutes });
        openIn = null;
      }
    } else if (state === 2) {
      openBreakOut = p.time;
    } else if (state === 3) {
      if (openBreakOut) {
        const durationMinutes = (p.time.getTime() - openBreakOut.getTime()) / 60_000;
        if (durationMinutes >= MIN_BREAK_MINUTES) {
          breaks.push({ breakStart: openBreakOut, breakEnd: p.time, durationMinutes });
        }
        openBreakOut = null;
      }
    }
  }
  if (openIn) {
    sessions.push({ in: openIn, out: null, durationMinutes: null });
  }

  const derived = finalizeDerived(sessions, punchLogs, "explicit", date);
  if (breaks.length > 0) {
    derived.breaks = breaks;
  }
  return derived;
}

function finalizeDerived(
  sessions: SessionPair[],
  punchLogs: PunchEvent[],
  mode: "explicit" | "inferred",
  date: string,
): DerivedDay {
  // Auto-close open last session at 22:00 IST for past days / after 22:00 today
  const autoClose = shouldAutoCloseAt(date);
  let closedSessions = sessions;
  if (autoClose && sessions.length > 0) {
    const last = sessions[sessions.length - 1]!;
    if (last.out == null && last.in.getTime() < autoClose.getTime()) {
      closedSessions = sessions.map((s, idx) => {
        if (idx === sessions.length - 1 && s.out == null) {
          const durationMinutes = (autoClose.getTime() - s.in.getTime()) / 60_000;
          return { ...s, out: autoClose, durationMinutes };
        }
        return s;
      });
    }
  }

  const completed = closedSessions.filter((s) => s.out != null);
  const clockIn = closedSessions[0]?.in ?? null;
  const clockOut = completed.length > 0 ? completed[completed.length - 1]!.out : null;

  let hoursWorked: number | null = null;
  if (completed.length > 0) {
    const totalMs = completed.reduce(
      (sum, s) => sum + (s.out!.getTime() - s.in.getTime()),
      0,
    );
    hoursWorked = totalMs / 3_600_000;
  }

  const isHalfDay = clockOut != null && hoursWorked != null && hoursWorked < 4;

  const breaks: DerivedDay["breaks"] = [];
  for (let i = 1; i < closedSessions.length; i++) {
    const prev = closedSessions[i - 1]!;
    const cur = closedSessions[i]!;
    if (!prev.out) continue;
    const durationMinutes = (cur.in.getTime() - prev.out.getTime()) / 60_000;
    if (durationMinutes >= MIN_BREAK_MINUTES) {
      breaks.push({ breakStart: prev.out, breakEnd: cur.in, durationMinutes });
    }
  }

  return { clockIn, clockOut, hoursWorked, isHalfDay, sessions: closedSessions, breaks, punchLogs, mode };
}

// ── Load punches for a day ────────────────────────────────────────────────────
export async function loadPunchesForDay(employeeId: string, date: string) {
  const start = istDayStart(date);
  const end = istDayEndExclusive(date);
  return db
    .select()
    .from(biometricPunchLogsTable)
    .where(
      and(
        eq(biometricPunchLogsTable.employeeId, employeeId),
        gte(biometricPunchLogsTable.punchTime, start),
        lt(biometricPunchLogsTable.punchTime, end),
      ),
    )
    .orderBy(asc(biometricPunchLogsTable.punchTime));
}

/** Display helper: derived punchLogs + sessions for an employee/date. */
export async function getDerivedDayView(employeeId: string, date: string): Promise<DerivedDay> {
  const punches = await loadPunchesForDay(employeeId, date);
  return deriveDayFromPunches(
    punches.map((p) => ({
      punchTime: new Date(p.punchTime),
      punchState: p.punchState,
      verifyType: p.verifyType,
    })),
    date,
  );
}

// ── Upsert derived attendance + breaks ────────────────────────────────────────
export interface DeriveResult {
  created: boolean;
  updated: boolean;
  skipped: boolean;
  sessionsCreated: number;
  breaksCreated: number;
}

export async function reDeriveAttendanceForDay(
  employeeId: string,
  date: string,
): Promise<DeriveResult> {
  const empty: DeriveResult = {
    created: false, updated: false, skipped: false,
    sessionsCreated: 0, breaksCreated: 0,
  };

  // Remap unmapped punches that now match this employee's code
  await remapUnmappedPunchesForEmployee(employeeId, date);

  const punches = await loadPunchesForDay(employeeId, date);
  if (punches.length === 0) return empty;

  const derived = deriveDayFromPunches(
    punches.map((p) => ({
      punchTime: new Date(p.punchTime),
      punchState: p.punchState,
      verifyType: p.verifyType,
    })),
    date,
  );

  const [existing] = await db
    .select()
    .from(attendanceRecordsTable)
    .where(
      and(
        eq(attendanceRecordsTable.employeeId, employeeId),
        eq(attendanceRecordsTable.date, date),
      ),
    )
    .limit(1);

  if (existing && (existing.type === "wfh" || existing.type === "wfh_pending")) {
    return { ...empty, skipped: true };
  }

  let notesExtra: string | null = null;
  const autoClose = shouldAutoCloseAt(date);
  if (
    autoClose &&
    derived.clockOut &&
    derived.clockOut.getTime() === autoClose.getTime()
  ) {
    notesExtra = "Auto clocked-out at 10:00 PM";
  }

  let recordId: string;
  let created = false;
  let updated = false;

  if (!existing) {
    recordId = crypto.randomUUID();
    await db.insert(attendanceRecordsTable).values({
      id: recordId,
      employeeId,
      date,
      type: "wfo",
      source: "biometric",
      clockIn: derived.clockIn,
      clockOut: derived.clockOut,
      hoursWorked: derived.hoursWorked,
      isLate: false,
      isHalfDay: derived.isHalfDay,
      notes: notesExtra,
    });
    created = true;
  } else {
    // Biometric wins for WFO (including web/manual/regularization sources)
    recordId = existing.id;
    let notes = existing.notes;
    if (notesExtra && !(notes ?? "").includes(notesExtra)) {
      notes = notes ? `${notes} | ${notesExtra}` : notesExtra;
    }
    await db
      .update(attendanceRecordsTable)
      .set({
        clockIn: derived.clockIn,
        clockOut: derived.clockOut,
        hoursWorked: derived.hoursWorked,
        isLate: false,
        isHalfDay: derived.isHalfDay,
        source: "biometric",
        type: "wfo",
        notes,
      })
      .where(eq(attendanceRecordsTable.id, recordId));
    updated = true;
  }

  // Sync biometric breaks — never touch manual breaks
  await db
    .delete(attendanceBreaksTable)
    .where(
      and(
        eq(attendanceBreaksTable.attendanceRecordId, recordId),
        eq(attendanceBreaksTable.source, "biometric"),
      ),
    );

  let breaksCreated = 0;
  for (const b of derived.breaks) {
    await db.insert(attendanceBreaksTable).values({
      id: crypto.randomUUID(),
      attendanceRecordId: recordId,
      employeeId,
      date,
      breakStart: b.breakStart,
      breakEnd: b.breakEnd,
      durationMinutes: b.durationMinutes,
      source: "biometric",
    });
    breaksCreated++;
  }

  return {
    created,
    updated,
    skipped: false,
    sessionsCreated: derived.sessions.length,
    breaksCreated,
  };
}

async function remapUnmappedPunchesForEmployee(employeeId: string, date: string): Promise<void> {
  const [emp] = await db
    .select({ id: employeesTable.id, code: employeesTable.employeeCode })
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  if (!emp?.code) return;

  const map = await buildEmployeeCodeMap();
  const start = istDayStart(date);
  const end = istDayEndExclusive(date);

  const unmapped = await db
    .select()
    .from(biometricPunchLogsTable)
    .where(
      and(
        isNull(biometricPunchLogsTable.employeeId),
        gte(biometricPunchLogsTable.punchTime, start),
        lt(biometricPunchLogsTable.punchTime, end),
      ),
    );

  for (const punch of unmapped) {
    const resolved = resolveEmployeeId(punch.empCode, map);
    if (resolved === employeeId) {
      await db
        .update(biometricPunchLogsTable)
        .set({ employeeId })
        .where(eq(biometricPunchLogsTable.id, punch.id));
    }
  }
}

// ── Store a single raw punch (shared by API sync + ADMS) ──────────────────────
export interface StorePunchInput {
  easyTimeId: number;
  empCode: string;
  punchTime: Date;
  punchState: number;
  verifyType?: number;
  terminalSn?: string | null;
  terminalAlias?: string | null;
  isAttendance?: number | null;
  source?: number | null;
  codeMap?: EmployeeCodeMap;
}

export interface StorePunchResult {
  inserted: boolean;
  skipped: boolean;
  reason?: string;
  employeeId: string | null;
  date: string | null;
}

export async function storeRawPunch(input: StorePunchInput): Promise<StorePunchResult> {
  const empCode = String(input.empCode ?? "").trim();
  if (!empCode) return { inserted: false, skipped: true, reason: "empty_code", employeeId: null, date: null };

  if (isVisitorCode(empCode)) {
    return { inserted: false, skipped: true, reason: "visitor", employeeId: null, date: null };
  }

  if (input.isAttendance === 0) {
    return { inserted: false, skipped: true, reason: "not_attendance", employeeId: null, date: null };
  }

  // Dedup by easyTimeId
  const [byId] = await db
    .select({ id: biometricPunchLogsTable.id, employeeId: biometricPunchLogsTable.employeeId, punchTime: biometricPunchLogsTable.punchTime })
    .from(biometricPunchLogsTable)
    .where(eq(biometricPunchLogsTable.easyTimeId, input.easyTimeId))
    .limit(1);
  if (byId) {
    return {
      inserted: false,
      skipped: true,
      reason: "dup_id",
      employeeId: byId.employeeId,
      date: byId.punchTime ? istDate(new Date(byId.punchTime)) : null,
    };
  }

  // Dedup by (empCode, punchTime) — covers ADMS/API overlap
  const [byEmpTime] = await db
    .select({ id: biometricPunchLogsTable.id, employeeId: biometricPunchLogsTable.employeeId, punchTime: biometricPunchLogsTable.punchTime })
    .from(biometricPunchLogsTable)
    .where(
      and(
        eq(biometricPunchLogsTable.empCode, empCode),
        eq(biometricPunchLogsTable.punchTime, input.punchTime),
      ),
    )
    .limit(1);
  if (byEmpTime) {
    return {
      inserted: false,
      skipped: true,
      reason: "dup_emp_time",
      employeeId: byEmpTime.employeeId,
      date: byEmpTime.punchTime ? istDate(new Date(byEmpTime.punchTime)) : istDate(input.punchTime),
    };
  }

  const map = input.codeMap ?? await buildEmployeeCodeMap();
  const employeeId = resolveEmployeeId(empCode, map);
  const date = istDate(input.punchTime);

  try {
    await db.insert(biometricPunchLogsTable).values({
      id: crypto.randomUUID(),
      easyTimeId: input.easyTimeId,
      empCode,
      employeeId,
      punchTime: input.punchTime,
      punchState: input.punchState,
      verifyType: input.verifyType ?? 1,
      terminalSn: input.terminalSn ?? null,
      terminalAlias: input.terminalAlias ?? null,
      isAttendance: input.isAttendance ?? null,
      source: input.source ?? null,
    });
  } catch (e) {
    // Unique constraint race — treat as skip
    const msg = String(e instanceof Error ? e.message : e);
    if (/duplicate|unique/i.test(msg)) {
      return { inserted: false, skipped: true, reason: "dup_constraint", employeeId, date };
    }
    throw e;
  }

  return { inserted: true, skipped: false, employeeId, date };
}

// ── Main sync ─────────────────────────────────────────────────────────────────
export async function syncBiometricPunches(): Promise<SyncSummary> {
  const ranAt = new Date().toISOString();
  const summary: SyncSummary = {
    ok: false,
    processed: 0,
    created: 0,
    updated: 0,
    skippedUnmapped: 0,
    unmappedCodes: [],
    lastPunchTime: null,
    sessionsCreated: 0,
    breaksCreated: 0,
    daysReprocessed: 0,
    ranAt,
  };

  const { configured } = biometricConfig();
  if (!configured) {
    summary.error = "EasyTime Pro not configured";
    await setConfig(STATUS_KEY, JSON.stringify(summary)).catch(() => {});
    return summary;
  }

  try {
    const cursorRaw = await getConfig(CURSOR_KEY);
    const cursorId = cursorRaw ? parseInt(cursorRaw, 10) || 0 : 0;

    const punches = await fetchNewTransactions(cursorId);
    const codeMap = await buildEmployeeCodeMap();
    const unmapped = new Set<string>();
    const affected = new Map<string, { employeeId: string; date: string }>();
    let maxId = cursorId;
    let lastPunch: Date | null = null;

    for (const p of punches) {
      const easyTimeId = Number(p.id);
      if (!easyTimeId || easyTimeId <= cursorId) continue;

      summary.processed++;
      if (easyTimeId > maxId) maxId = easyTimeId;

      const when = parseISTPunch(String(p.punch_time ?? ""));
      if (!when) continue;
      if (!lastPunch || when > lastPunch) lastPunch = when;

      const empCode = String(p.emp_code ?? "").trim();
      const punchState = parseInt(String(p.punch_state ?? "255"), 10);
      const result = await storeRawPunch({
        easyTimeId,
        empCode,
        punchTime: when,
        punchState: Number.isFinite(punchState) ? punchState : 255,
        verifyType: p.verify_type ?? 1,
        terminalSn: p.terminal_sn ?? null,
        terminalAlias: p.terminal_alias ?? null,
        isAttendance: p.is_attendance ?? null,
        source: p.source ?? null,
        codeMap,
      });

      if (result.reason === "visitor" || result.reason === "not_attendance") continue;

      if (!result.employeeId) {
        if (empCode && !isVisitorCode(empCode)) {
          unmapped.add(empCode);
          summary.skippedUnmapped++;
        }
        continue;
      }

      // Re-derive for newly inserted punches, and for overlaps already stored via ADMS
      if (result.date && (result.inserted || result.reason === "dup_emp_time")) {
        const key = `${result.employeeId}|${result.date}`;
        affected.set(key, { employeeId: result.employeeId, date: result.date });
      }
    }

    // Also re-derive days for punches that were duplicates but might need refresh?
    // Spec: only from newly inserted punches. Stick to that.

    for (const { employeeId, date } of affected.values()) {
      const r = await reDeriveAttendanceForDay(employeeId, date);
      summary.daysReprocessed++;
      if (r.created) summary.created++;
      if (r.updated) summary.updated++;
      summary.sessionsCreated += r.sessionsCreated;
      summary.breaksCreated += r.breaksCreated;
    }

    if (maxId > cursorId) {
      await setConfig(CURSOR_KEY, String(maxId));
    }
    summary.lastPunchTime = lastPunch ? fmtIST(lastPunch) : null;
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
  try {
    return JSON.parse(raw) as SyncSummary;
  } catch {
    return null;
  }
}

/** Quick auth check for the "Test connection" button. */
export async function testBiometricConnection(): Promise<{ ok: boolean; error?: string }> {
  const { configured } = biometricConfig();
  if (!configured) {
    return { ok: false, error: "EasyTime Pro not configured (set EASYTIME_URL, EASYTIME_USER, EASYTIME_PASS)" };
  }
  try {
    await getToken(true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}

/**
 * Auto-close an open biometric session at 22:00 IST without full re-derive.
 * Returns true if the record was closed.
 */
export async function autoCloseBiometricSession(
  record: { id: string; employeeId: string; date: string; notes: string | null },
  autoClockOutAt: Date,
): Promise<boolean> {
  const derived = await getDerivedDayView(record.employeeId, record.date);
  if (derived.sessions.length === 0) return false;

  const last = derived.sessions[derived.sessions.length - 1]!;
  if (last.out != null) {
    // Already fully paired — just ensure clockOut/hours are set
    if (!derived.clockOut) return false;
    const hoursWorked = derived.hoursWorked;
    await db
      .update(attendanceRecordsTable)
      .set({
        clockOut: derived.clockOut,
        hoursWorked,
        isHalfDay: hoursWorked != null && hoursWorked > 0 && hoursWorked < 4,
        notes: (record.notes ? record.notes + " | " : "") + "Auto clocked-out at 10:00 PM",
      })
      .where(eq(attendanceRecordsTable.id, record.id));
    return true;
  }

  // Pair last open IN with 22:00
  const closedSessions = derived.sessions.map((s, idx) => {
    if (idx === derived.sessions.length - 1 && s.out == null) {
      const durationMinutes = (autoClockOutAt.getTime() - s.in.getTime()) / 60_000;
      return { ...s, out: autoClockOutAt, durationMinutes };
    }
    return s;
  });

  const totalMs = closedSessions
    .filter((s) => s.out != null)
    .reduce((sum, s) => sum + (s.out!.getTime() - s.in.getTime()), 0);
  const hoursWorked = totalMs / 3_600_000;

  await db
    .update(attendanceRecordsTable)
    .set({
      clockOut: autoClockOutAt,
      hoursWorked,
      isHalfDay: hoursWorked > 0 && hoursWorked < 4,
      notes: (record.notes ? record.notes + " | " : "") + "Auto clocked-out at 10:00 PM",
    })
    .where(eq(attendanceRecordsTable.id, record.id));

  return true;
}
