import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  departmentsTable,
  designationsTable,
  companyProfileTable,
  notificationSettingsTable,
  financialYearConfigTable,
  leavePoliciesTable,
  leaveTypesTable,
  employeesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";

const router: IRouter = Router();

router.get("/admin/departments", requireAuth, async (_req, res) => {
  try {
    const depts = await db.select().from(departmentsTable);
    const enriched = await Promise.all(
      depts.map(async (d) => {
        let headName: string | null = null;
        if (d.headId) {
          const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, d.headId));
          headName = emp ? `${emp.firstName} ${emp.lastName}` : null;
        }
        return { ...d, headName };
      })
    );
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/admin/departments", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const [dept] = await db.insert(departmentsTable).values(req.body).returning();
    res.status(201).json({ ...dept, headName: null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/admin/departments/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const [dept] = await db.update(departmentsTable).set(req.body).where(eq(departmentsTable.id, req.params.id)).returning();
    if (!dept) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...dept, headName: null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/admin/departments/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.delete(departmentsTable).where(eq(departmentsTable.id, req.params.id));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/designations", requireAuth, async (_req, res) => {
  try {
    const designations = await db.select().from(designationsTable);
    const depts = await db.select().from(departmentsTable);
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const result = designations.map((d) => ({
      ...d,
      departmentName: d.departmentId ? (deptMap.get(d.departmentId) ?? null) : null,
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/admin/designations", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const [desig] = await db.insert(designationsTable).values(req.body).returning();
    res.status(201).json({ ...desig, departmentName: null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/admin/designations/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const [desig] = await db.update(designationsTable).set(req.body).where(eq(designationsTable.id, req.params.id)).returning();
    if (!desig) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...desig, departmentName: null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/admin/designations/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.delete(designationsTable).where(eq(designationsTable.id, req.params.id));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/company-profile", requireAuth, async (_req, res): Promise<void> => {
  try {
    const [profile] = await db.select().from(companyProfileTable);
    if (!profile) {
      const [created] = await db
        .insert(companyProfileTable)
        .values({ name: "My Company" })
        .returning();
      res.json(created);
      return;
    }
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/admin/company-profile", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const [existing] = await db.select().from(companyProfileTable);
    if (!existing) {
      const [created] = await db.insert(companyProfileTable).values(req.body).returning();
      res.json(created);
      return;
    }
    const [updated] = await db
      .update(companyProfileTable)
      .set(req.body)
      .where(eq(companyProfileTable.id, existing.id))
      .returning();
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/leave-policies", requireAuth, async (_req, res) => {
  try {
    const policies = await db.select().from(leavePoliciesTable);
    const types = await db.select().from(leaveTypesTable);
    const typeMap = new Map(types.map((t) => [t.id, t.name]));
    const result = policies.map((p) => ({
      ...p,
      leaveTypeName: typeMap.get(p.leaveTypeId) ?? "",
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/admin/leave-policies", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const [policy] = await db.insert(leavePoliciesTable).values(req.body).returning();
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, policy.leaveTypeId));
    res.status(201).json({ ...policy, leaveTypeName: lt?.name ?? "" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/admin/leave-policies/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const [policy] = await db.update(leavePoliciesTable).set(req.body).where(eq(leavePoliciesTable.id, req.params.id)).returning();
    if (!policy) { res.status(404).json({ error: "Not found" }); return; }
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, policy.leaveTypeId));
    res.json({ ...policy, leaveTypeName: lt?.name ?? "" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/notification-settings", requireAuth, async (_req, res) => {
  try {
    const settings = await db.select().from(notificationSettingsTable);
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/admin/notification-settings", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { eventType, isEnabled } = req.body as { eventType: string; isEnabled: boolean };
    const [setting] = await db
      .update(notificationSettingsTable)
      .set({ isEnabled })
      .where(eq(notificationSettingsTable.eventType, eventType))
      .returning();
    if (!setting) { res.status(404).json({ error: "Not found" }); return; }
    res.json(setting);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/financial-year", requireAuth, async (_req, res): Promise<void> => {
  try {
    const [config] = await db.select().from(financialYearConfigTable);
    if (!config) {
      const [created] = await db
        .insert(financialYearConfigTable)
        .values({ startMonth: 4, startDay: 1, endMonth: 3, endDay: 31, currentYear: "2025-26" })
        .returning();
      res.json(created);
      return;
    }
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/admin/financial-year", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const [existing] = await db.select().from(financialYearConfigTable);
    if (!existing) {
      const [created] = await db.insert(financialYearConfigTable).values(req.body).returning();
      res.json(created);
      return;
    }
    const [updated] = await db
      .update(financialYearConfigTable)
      .set(req.body)
      .where(eq(financialYearConfigTable.id, existing.id))
      .returning();
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
