/**
 * Biometric (EasyTime Pro) admin endpoints — status, manual sync, connection test,
 * raw punch logs, and forced re-derivation.
 */
import { Router, type IRouter } from "express";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import {
  syncBiometricPunches,
  getBiometricStatus,
  testBiometricConnection,
  biometricConfig,
  reDeriveAttendanceForDay,
  getDerivedDayView,
  loadPunchesForDay,
  istDate,
} from "../lib/biometricSync";

const router: IRouter = Router();

router.get(
  "/attendance/biometric/status",
  requireAuth,
  requireRole("super_admin", "hr_admin"),
  async (_req, res) => {
    const { configured, base } = biometricConfig();
    const status = await getBiometricStatus();
    res.json({ configured, serverUrl: base || null, status });
  },
);

router.get(
  "/attendance/biometric/test-connection",
  requireAuth,
  requireRole("super_admin", "hr_admin"),
  async (_req, res) => {
    const result = await testBiometricConnection();
    res.status(result.ok ? 200 : 400).json(result);
  },
);

router.post(
  "/attendance/biometric/sync",
  requireAuth,
  requireRole("super_admin", "hr_admin"),
  async (_req, res) => {
    const summary = await syncBiometricPunches();
    res.status(summary.ok ? 200 : 500).json(summary);
  },
);

/**
 * GET /attendance/biometric/punch-logs?employeeId=xxx&date=YYYY-MM-DD
 * Raw device punches + inferred direction / sessions for debugging.
 */
router.get(
  "/attendance/biometric/punch-logs",
  requireAuth,
  requireRole("super_admin", "hr_admin"),
  async (req, res): Promise<void> => {
    try {
      const employeeId = String(req.query.employeeId ?? "").trim();
      const date = String(req.query.date ?? "").trim() || istDate(new Date());
      if (!employeeId) {
        res.status(400).json({ error: "employeeId is required" });
        return;
      }

      const raw = await loadPunchesForDay(employeeId, date);
      const derived = await getDerivedDayView(employeeId, date);

      res.json({
        employeeId,
        date,
        mode: derived.mode,
        punchCount: raw.length,
        punches: raw.map((p) => ({
          id: p.id,
          easyTimeId: p.easyTimeId,
          empCode: p.empCode,
          time: new Date(p.punchTime).toISOString(),
          punchState: p.punchState,
          verifyType: p.verifyType,
          terminalSn: p.terminalSn,
          terminalAlias: p.terminalAlias,
          source: p.source,
        })),
        punchLogs: derived.punchLogs.map((p) => ({
          time: p.time.toISOString(),
          punchState: p.punchState,
          verifyType: p.verifyType,
          direction: p.direction,
        })),
        sessions: derived.sessions.map((s) => ({
          in: s.in.toISOString(),
          out: s.out?.toISOString() ?? null,
          durationMinutes: s.durationMinutes,
        })),
        derived: {
          clockIn: derived.clockIn?.toISOString() ?? null,
          clockOut: derived.clockOut?.toISOString() ?? null,
          hoursWorked: derived.hoursWorked,
          isHalfDay: derived.isHalfDay,
        },
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  },
);

/**
 * POST /attendance/biometric/re-derive?employeeId=xxx&date=YYYY-MM-DD
 * Force re-derivation after mapping an employee code or fixing data.
 */
router.post(
  "/attendance/biometric/re-derive",
  requireAuth,
  requireRole("super_admin", "hr_admin"),
  async (req, res): Promise<void> => {
    try {
      const employeeId = String(req.query.employeeId ?? req.body?.employeeId ?? "").trim();
      const date = String(req.query.date ?? req.body?.date ?? "").trim();
      if (!employeeId || !date) {
        res.status(400).json({ error: "employeeId and date are required" });
        return;
      }

      const result = await reDeriveAttendanceForDay(employeeId, date);
      const derived = await getDerivedDayView(employeeId, date);

      res.json({
        ...result,
        employeeId,
        date,
        clockIn: derived.clockIn?.toISOString() ?? null,
        clockOut: derived.clockOut?.toISOString() ?? null,
        hoursWorked: derived.hoursWorked,
        sessions: derived.sessions.map((s) => ({
          in: s.in.toISOString(),
          out: s.out?.toISOString() ?? null,
          durationMinutes: s.durationMinutes,
        })),
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  },
);

export default router;
