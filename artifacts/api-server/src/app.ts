import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { clerkMiddleware } from "@clerk/express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import router from "./routes";
import { resolveUserMiddleware } from "./middlewares/authMiddleware";
import { seedSystemRoles } from "./lib/seedRoles";
import { handleAdmsPush } from "./routes/zkteco";
import { processOverduePendingDocLeaves, ensureLwpLeaveType } from "./routes/leave";
import { autoClockOutMissed, scheduleDailyIST } from "./routes/attendance";
import { notifyForgottenClockIn, notifyForgottenClockOut, notifyBirthdaysAndAnniversaries } from "./lib/scheduledNotifications";
import { runScheduledAutomations } from "./lib/automations";
import { syncBiometricPunches, biometricConfig } from "./lib/biometricSync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
// 25 MB limit to support base64-encoded file uploads (PDFs, docs up to ~18 MB raw)
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(cookieParser());

const hasClerkKeys = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);
// Clerk verifies the session JWT and makes auth data available via getAuth(req)
// If keys are not provided, we still allow dev usage via BYPASS_AUTH in authMiddleware.ts
if (hasClerkKeys) {
  app.use(clerkMiddleware());
}
// Resolve Clerk userId into our local DB user record on req.user
app.use(resolveUserMiddleware);

// Seed system roles and default permissions on startup
seedSystemRoles().catch((err) => console.error("[seed] Failed to seed roles:", err));

// Run once on startup, then every 6 hours — converts overdue pending_doc leaves to LOP
processOverduePendingDocLeaves();
setInterval(processOverduePendingDocLeaves, 6 * 60 * 60 * 1000);

// Ensure system "Leave Without Pay" leave type exists
ensureLwpLeaveType();

// Auto clock-out at 10:00 PM IST — closes any open WFO records with full hours calc
scheduleDailyIST(22, autoClockOutMissed);

// Scheduled in-app notifications (IST)
scheduleDailyIST(9,  notifyBirthdaysAndAnniversaries, 0);  // 9:00 AM  — birthdays & anniversaries (push)
scheduleDailyIST(9,  () => {                               // 9:00 AM  — birthday/anniversary emails
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return runScheduledAutomations({ today });
}, 0);
scheduleDailyIST(10, notifyForgottenClockIn, 15);           // 10:15 AM — forgot to clock in
scheduleDailyIST(19, notifyForgottenClockOut, 15);          // 7:15 PM  — forgot to clock out

// Biometric (EasyTime Pro) attendance sync — pull punches every 15 minutes.
// Only runs when EASYTIME_URL / EASYTIME_USER / EASYTIME_PASS are set.
if (biometricConfig().configured) {
  const runBiometricSync = () =>
    syncBiometricPunches()
      .then((s) => {
        if (!s.ok) console.error("[biometric] sync error:", s.error);
        else {
          console.log(
            `[biometric] sync: ${s.created} created, ${s.updated} updated, ` +
            `${s.daysReprocessed} days, ${s.sessionsCreated} sessions, ` +
            `${s.breaksCreated} breaks, ${s.skippedUnmapped} unmapped`,
          );
        }
      })
      .catch((e) => console.error("[biometric] sync threw:", e));
  // Kick off shortly after boot, then every 15 minutes.
  setTimeout(runBiometricSync, 30_000);
  setInterval(runBiometricSync, 15 * 60 * 1000);
  console.log("[biometric] EasyTime Pro sync enabled (every 15 min)");
} else {
  console.log("[biometric] EasyTime Pro sync disabled (env not configured)");
}

// ZKTeco ADMS push — device sends plain-text punches, no auth header
// Must be registered BEFORE the auth middleware router
app.get("/iclock/cdata", handleAdmsPush);
app.post("/iclock/cdata", express.text({ type: "*/*" }), handleAdmsPush);

app.use("/api", router);

// Serve built React frontend (run `pnpm build:frontend` first)
const frontendDist = resolve(__dirname, "../../hr-system/dist/public");
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api)/, (_req, res) => {
    res.sendFile("index.html", { root: frontendDist });
  });
  console.log(`Serving frontend from: ${frontendDist}`);
}

export default app;
