import { getAuth } from "@clerk/express";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import { resolveClerkUser } from "../lib/auth";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

const BYPASS_AUTH = process.env.NODE_ENV !== "production";

/**
 * Middleware that resolves the Clerk session into a local DB user on req.user.
 * Must run AFTER clerkMiddleware() in the middleware chain.
 */
export async function resolveUserMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const hasClerkKeys = Boolean(
    process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY,
  );

  // In local/dev without Clerk config, skip Clerk auth resolution entirely.
  if (!hasClerkKeys) {
    next();
    return;
  }

  try {
    const { userId } = getAuth(req);
    if (!userId) {
      next();
      return;
    }

    const user = await resolveClerkUser(userId);
    if (user) {
      req.user = user;
    }
  } catch (err) {
    // Never block request handling (including static frontend) due to auth resolution.
    console.error("[auth] Failed to resolve request auth context:", err);
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (BYPASS_AUTH && !req.isAuthenticated()) {
    req.user = { id: "dev-user", role: "hr_admin", permissions: {} };
  }
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (BYPASS_AUTH && !req.isAuthenticated()) {
      req.user = { id: "dev-user", role: "hr_admin", permissions: {} };
    }
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const userRole = req.user.role ?? "employee";
    if (!roles.includes(userRole)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export function requirePermission(module: string, action: "view" | "create" | "edit" | "delete") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (BYPASS_AUTH && !req.isAuthenticated()) {
      req.user = { id: "dev-user", role: "hr_admin", permissions: {} };
    }
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    // super_admin always has full access
    if (req.user.role === "super_admin") {
      next();
      return;
    }
    const perm = req.user.permissions?.[module];
    if (!perm || !perm[action]) {
      res.status(403).json({ error: `Permission denied: ${action} on ${module}` });
      return;
    }
    next();
  };
}
