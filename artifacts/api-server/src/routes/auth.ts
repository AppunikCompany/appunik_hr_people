import { Router, type IRouter, type Request, type Response } from "express";
import { db, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

/**
 * Returns the current authenticated user's data.
 * Clerk handles login/signup/sessions on the frontend — this endpoint
 * just returns the local DB user record for the authenticated Clerk user.
 */
router.get("/auth/user", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.json({ id: null, role: "guest" });
    return;
  }

  const user = req.user;

  const [emp] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.userId, user.id));

  res.json({
    id: user.id,
    username: user.firstName,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
    email: user.email,
    role: user.role ?? "employee",
    employeeId: emp?.id ?? null,
  });
});

export default router;
