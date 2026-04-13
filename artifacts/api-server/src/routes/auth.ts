import { Router, type IRouter, type Request, type Response } from "express";
import { db, employeesTable, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { loadPermissionsForRole } from "../lib/seedRoles";

const router: IRouter = Router();

/**
 * Returns the current authenticated user's data, including module permissions.
 * Clerk handles login/signup/sessions on the frontend — this endpoint
 * just returns the local DB user record for the authenticated Clerk user.
 */
router.get("/auth/user", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.json({ id: null, role: "guest", permissions: {} });
    return;
  }

  const user = req.user;

  const [emp] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.userId, user.id));

  // Load permissions for the user's role
  const role = user.role ?? "employee";
  const [roleRecord] = await db.select().from(rolesTable).where(eq(rolesTable.name, role));
  const permissions = roleRecord ? await loadPermissionsForRole(roleRecord.id) : {};

  res.json({
    id: user.id,
    username: user.firstName,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
    email: user.email,
    role,
    employeeId: emp?.id ?? null,
    permissions,
  });
});

export default router;
