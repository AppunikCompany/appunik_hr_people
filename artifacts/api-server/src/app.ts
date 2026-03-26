import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { resolveUserMiddleware } from "./middlewares/authMiddleware";

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

app.use("/api", router);

export default app;
