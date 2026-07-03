/**
 * Biometric (EasyTime Pro) admin endpoints — status, manual sync, connection test.
 * HR / super-admin only. The actual sync runs on a 15-minute interval (see app.ts).
 */
import { Router, type IRouter } from "express";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import {
  syncBiometricPunches,
  getBiometricStatus,
  testBiometricConnection,
  biometricConfig,
} from "../lib/biometricSync";

const router: IRouter = Router();

// Current sync status + whether the integration is configured.
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

// Verify credentials / reachability without pulling punches.
router.get(
  "/attendance/biometric/test-connection",
  requireAuth,
  requireRole("super_admin", "hr_admin"),
  async (_req, res) => {
    const result = await testBiometricConnection();
    res.status(result.ok ? 200 : 400).json(result);
  },
);

// Trigger an immediate sync.
router.post(
  "/attendance/biometric/sync",
  requireAuth,
  requireRole("super_admin", "hr_admin"),
  async (_req, res) => {
    const summary = await syncBiometricPunches();
    res.status(summary.ok ? 200 : 500).json(summary);
  },
);

export default router;
