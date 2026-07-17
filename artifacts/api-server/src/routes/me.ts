import { Router, type IRouter } from "express";
import { db, employeesTable, employeeExperienceTable, employeeEducationTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();

const PRIVILEGED_ROLES = new Set(["super_admin", "hr_admin", "it_admin", "manager"]);

// GET /me/onboarding-status
router.get("/me/onboarding-status", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    if (PRIVILEGED_ROLES.has(req.user!.role ?? "employee")) {
      res.json({ completed: true, employeeId: null });
      return;
    }
    const [emp] = await db
      .select({ id: employeesTable.id, onboardingCompleted: employeesTable.onboardingCompleted })
      .from(employeesTable)
      .where(eq(employeesTable.userId, userId));
    if (!emp) { res.json({ completed: true, employeeId: null }); return; }
    res.json({ completed: emp.onboardingCompleted, employeeId: emp.id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /me/personal-details
router.patch("/me/personal-details", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { phone, workPhone, personalEmail, gender, dateOfBirth, maritalStatus, address, currentLocation, emergencyContact, emergencyPhone } = req.body as {
      phone?: string; workPhone?: string; personalEmail?: string; gender?: string;
      dateOfBirth?: string; maritalStatus?: string; address?: string;
      currentLocation?: string; emergencyContact?: string; emergencyPhone?: string;
    };
    await db.update(employeesTable)
      .set({ phone, workPhone, personalEmail, gender, dateOfBirth, maritalStatus, address, currentLocation, emergencyContact, emergencyPhone })
      .where(eq(employeesTable.userId, userId));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /me/profile-image
// Employees may set or update their own profile photo (data URL or external URL).
router.patch("/me/profile-image", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { profileImageUrl } = req.body as { profileImageUrl?: string | null };
    if (typeof profileImageUrl !== "string") {
      res.status(400).json({ error: "profileImageUrl must be a string" });
      return;
    }
    const trimmed = profileImageUrl.trim();
    if (trimmed.length > 5_000_000) {
      res.status(413).json({ error: "Image is too large. Use a URL or compress the file." });
      return;
    }
    await db.update(employeesTable)
      .set({ profileImageUrl: trimmed === "" ? null : trimmed })
      .where(eq(employeesTable.userId, userId));
    res.json({ ok: true, profileImageUrl: trimmed === "" ? null : trimmed });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /me/experience
router.get("/me/experience", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.userId, userId));
    if (!emp) { res.json([]); return; }
    const rows = await db.select().from(employeeExperienceTable).where(eq(employeeExperienceTable.employeeId, emp.id));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /me/experience
router.post("/me/experience", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.userId, userId));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
    const id = crypto.randomUUID();
    await db.insert(employeeExperienceTable).values({ ...req.body, id, employeeId: emp.id });
    const [row] = await db.select().from(employeeExperienceTable).where(eq(employeeExperienceTable.id, id));
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /me/experience/:id
router.delete("/me/experience/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.userId, userId));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
    await db.delete(employeeExperienceTable).where(
      and(eq(employeeExperienceTable.id, req.params.id as string), eq(employeeExperienceTable.employeeId, emp.id))
    );
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /me/education
router.get("/me/education", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.userId, userId));
    if (!emp) { res.json([]); return; }
    const rows = await db.select().from(employeeEducationTable).where(eq(employeeEducationTable.employeeId, emp.id));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /me/education
router.post("/me/education", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.userId, userId));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
    const id = crypto.randomUUID();
    await db.insert(employeeEducationTable).values({ ...req.body, id, employeeId: emp.id });
    const [row] = await db.select().from(employeeEducationTable).where(eq(employeeEducationTable.id, id));
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /me/education/:id
router.delete("/me/education/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.userId, userId));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
    await db.delete(employeeEducationTable).where(
      and(eq(employeeEducationTable.id, req.params.id as string), eq(employeeEducationTable.employeeId, emp.id))
    );
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /me/onboarding/complete
router.post("/me/onboarding/complete", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    await db.update(employeesTable)
      .set({ onboardingCompleted: true, onboardingCompletedAt: new Date() })
      .where(eq(employeesTable.userId, userId));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
