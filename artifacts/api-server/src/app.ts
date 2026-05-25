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
import { processOverduePendingDocLeaves } from "./routes/leave";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
