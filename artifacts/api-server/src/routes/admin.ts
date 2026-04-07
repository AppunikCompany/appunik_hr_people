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
  usersTable,
  rolesTable,
  rolePermissionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";

const router: IRouter = Router();

router.get("/admin/departments", requireAuth, requireRole("super_admin", "hr_admin", "it_admin", "manager"), async (_req, res) => {
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
    const deptId = crypto.randomUUID();
    await db.insert(departmentsTable).values({ ...req.body, id: deptId });
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, deptId));
    res.status(201).json({ ...dept, headName: null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/admin/departments/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.update(departmentsTable).set(req.body).where(eq(departmentsTable.id, (req.params.id as string)));
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, (req.params.id as string)));
    if (!dept) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...dept, headName: null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/admin/departments/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.delete(departmentsTable).where(eq(departmentsTable.id, (req.params.id as string)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/designations", requireAuth, requireRole("super_admin", "hr_admin", "it_admin", "manager"), async (_req, res) => {
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
    const desigId = crypto.randomUUID();
    await db.insert(designationsTable).values({ ...req.body, id: desigId });
    const [desig] = await db.select().from(designationsTable).where(eq(designationsTable.id, desigId));
    res.status(201).json({ ...desig, departmentName: null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/admin/designations/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.update(designationsTable).set(req.body).where(eq(designationsTable.id, (req.params.id as string)));
    const [desig] = await db.select().from(designationsTable).where(eq(designationsTable.id, (req.params.id as string)));
    if (!desig) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...desig, departmentName: null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/admin/designations/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.delete(designationsTable).where(eq(designationsTable.id, (req.params.id as string)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/company-profile", requireAuth, requireRole("super_admin", "hr_admin"), async (_req, res): Promise<void> => {
  try {
    const [profile] = await db.select().from(companyProfileTable);
    if (!profile) {
      const cpId = crypto.randomUUID();
      await db.insert(companyProfileTable).values({ id: cpId, name: "My Company" });
      const [created] = await db.select().from(companyProfileTable).where(eq(companyProfileTable.id, cpId));
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
      const newCpId = crypto.randomUUID();
      await db.insert(companyProfileTable).values({ ...req.body, id: newCpId });
      const [created] = await db.select().from(companyProfileTable).where(eq(companyProfileTable.id, newCpId));
      res.json(created);
      return;
    }
    await db.update(companyProfileTable).set(req.body).where(eq(companyProfileTable.id, existing.id));
    const [updated] = await db.select().from(companyProfileTable).where(eq(companyProfileTable.id, existing.id));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/leave-policies", requireAuth, requireRole("super_admin", "hr_admin"), async (_req, res) => {
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
    const policyId = crypto.randomUUID();
    await db.insert(leavePoliciesTable).values({ ...req.body, id: policyId });
    const [policy] = await db.select().from(leavePoliciesTable).where(eq(leavePoliciesTable.id, policyId));
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, policy.leaveTypeId));
    res.status(201).json({ ...policy, leaveTypeName: lt?.name ?? "" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/admin/leave-policies/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.update(leavePoliciesTable).set(req.body).where(eq(leavePoliciesTable.id, (req.params.id as string)));
    const [policy] = await db.select().from(leavePoliciesTable).where(eq(leavePoliciesTable.id, (req.params.id as string)));
    if (!policy) { res.status(404).json({ error: "Not found" }); return; }
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, policy.leaveTypeId));
    res.json({ ...policy, leaveTypeName: lt?.name ?? "" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/notification-settings", requireAuth, requireRole("super_admin", "hr_admin"), async (_req, res) => {
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
    await db.update(notificationSettingsTable).set({ isEnabled }).where(eq(notificationSettingsTable.eventType, eventType));
    const [setting] = await db.select().from(notificationSettingsTable).where(eq(notificationSettingsTable.eventType, eventType));
    if (!setting) { res.status(404).json({ error: "Not found" }); return; }
    res.json(setting);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/admin/financial-year", requireAuth, requireRole("super_admin", "hr_admin"), async (_req, res): Promise<void> => {
  try {
    const [config] = await db.select().from(financialYearConfigTable);
    if (!config) {
      const fyId = crypto.randomUUID();
      await db.insert(financialYearConfigTable).values({ id: fyId, startMonth: 4, startDay: 1, endMonth: 3, endDay: 31, currentYear: "2025-26" });
      const [created] = await db.select().from(financialYearConfigTable).where(eq(financialYearConfigTable.id, fyId));
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
      const newFyId = crypto.randomUUID();
      await db.insert(financialYearConfigTable).values({ ...req.body, id: newFyId });
      const [created] = await db.select().from(financialYearConfigTable).where(eq(financialYearConfigTable.id, newFyId));
      res.json(created);
      return;
    }
    await db.update(financialYearConfigTable).set(req.body).where(eq(financialYearConfigTable.id, existing.id));
    const [updated] = await db.select().from(financialYearConfigTable).where(eq(financialYearConfigTable.id, existing.id));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AD-06: Role & Permission Management ──
router.get("/admin/users", requireAuth, requireRole("super_admin"), async (_req, res) => {
  try {
    const users = await db.select().from(usersTable);
    // Enrich with employee link if exists
    const employees = await db.select().from(employeesTable);
    const empByUserId = new Map(employees.filter((e) => e.userId).map((e) => [e.userId, e]));

    const result = users.map((u) => {
      const emp = empByUserId.get(u.id);
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        employeeId: emp?.id ?? null,
        employeeCode: emp?.employeeCode ?? null,
        createdAt: u.createdAt,
      };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/admin/users/:id/role", requireAuth, requireRole("super_admin"), async (req, res): Promise<void> => {
  try {
    const userId = req.params.id as string;
    const { role } = req.body as { role: string };
    const allRoles = await db.select({ name: rolesTable.name }).from(rolesTable);
    const validRoleNames = allRoles.map((r) => r.name);
    if (!validRoleNames.includes(role)) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${validRoleNames.join(", ")}` });
      return;
    }
    await db.update(usersTable).set({ role }).where(eq(usersTable.id, userId));
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Roles CRUD ──────────────────────────────────────────────────────────────

router.get("/admin/roles", requireAuth, requireRole("super_admin"), async (_req, res) => {
  try {
    const roles = await db.select().from(rolesTable);
    const perms = await db.select().from(rolePermissionsTable);
    const result = roles.map((r) => ({
      ...r,
      permissions: perms.filter((p) => p.roleId === r.id),
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/admin/roles", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const { name, description, permissions } = req.body as {
      name: string;
      description?: string;
      permissions?: Array<{ module: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>;
    };
    const roleId = crypto.randomUUID();
    await db.insert(rolesTable).values({ id: roleId, name, description, isSystem: false, isProtected: false });
    if (permissions && Array.isArray(permissions)) {
      for (const p of permissions) {
        await db.insert(rolePermissionsTable).values({ id: crypto.randomUUID(), roleId, ...p });
      }
    }
    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId));
    const rolePerms = await db.select().from(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, roleId));
    res.status(201).json({ ...role, permissions: rolePerms });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/admin/roles/:id", requireAuth, requireRole("super_admin"), async (req, res): Promise<void> => {
  try {
    const roleId = req.params.id as string;
    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId));
    if (!role) { res.status(404).json({ error: "Role not found" }); return; }
    if (role.isProtected) { res.status(403).json({ error: "Cannot modify protected role" }); return; }
    const { name, description } = req.body as { name?: string; description?: string };
    await db.update(rolesTable).set({ name, description }).where(eq(rolesTable.id, roleId));
    const [updated] = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId));
    const rolePerms = await db.select().from(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, roleId));
    res.json({ ...updated, permissions: rolePerms });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/admin/roles/:id", requireAuth, requireRole("super_admin"), async (req, res): Promise<void> => {
  try {
    const roleId = req.params.id as string;
    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId));
    if (!role) { res.status(404).json({ error: "Role not found" }); return; }
    if (role.isSystem) { res.status(403).json({ error: "Cannot delete system role" }); return; }
    await db.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, roleId));
    await db.delete(rolesTable).where(eq(rolesTable.id, roleId));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put("/admin/roles/:id/permissions", requireAuth, requireRole("super_admin"), async (req, res): Promise<void> => {
  try {
    const roleId = req.params.id as string;
    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId));
    if (!role) { res.status(404).json({ error: "Role not found" }); return; }
    if (role.isProtected) { res.status(403).json({ error: "Cannot modify protected role permissions" }); return; }
    const permissions = req.body as Array<{ module: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>;
    await db.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, roleId));
    for (const p of permissions) {
      await db.insert(rolePermissionsTable).values({ id: crypto.randomUUID(), roleId, ...p });
    }
    const rolePerms = await db.select().from(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, roleId));
    res.json(rolePerms);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
