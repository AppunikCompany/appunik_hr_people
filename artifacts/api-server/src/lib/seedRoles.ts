import { db, rolesTable, rolePermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const ROLE_MODULES = [
  "dashboard",
  "employees",
  "attendance",
  "leave",
  "assets",
  "performance",
  "reports",
  "payroll",
  "automations",
  "onboarding",
  "settings",
  "roles",
] as const;

export type RoleModule = (typeof ROLE_MODULES)[number];

type Perm = { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };

const full: Perm = { canView: true, canCreate: true, canEdit: true, canDelete: true };
const viewOnly: Perm = { canView: true, canCreate: false, canEdit: false, canDelete: false };
const viewCreateEdit: Perm = { canView: true, canCreate: true, canEdit: true, canDelete: false };
const none: Perm = { canView: false, canCreate: false, canEdit: false, canDelete: false };

const SYSTEM_ROLES: Array<{
  name: string;
  description: string;
  isProtected: boolean;
  permissions: Record<string, Perm>;
}> = [
  {
    name: "super_admin",
    description: "Full system access — all modules, all actions",
    isProtected: true,
    permissions: Object.fromEntries(ROLE_MODULES.map((m) => [m, full])),
  },
  {
    name: "hr_admin",
    description: "HR management — all modules except Roles",
    isProtected: false,
    permissions: {
      dashboard: full,
      employees: full,
      attendance: full,
      leave: full,
      assets: full,
      performance: full,
      reports: full,
      payroll: full,
      automations: full,
      onboarding: full,
      settings: full,
      roles: none,
    },
  },
  {
    name: "it_admin",
    description: "IT management — assets and limited employee access",
    isProtected: false,
    permissions: {
      dashboard: viewOnly,
      employees: viewOnly,
      attendance: viewOnly,
      leave: none,
      assets: full,
      performance: none,
      reports: viewOnly,
      payroll: none,
      automations: none,
      onboarding: none,
      settings: viewOnly,
      roles: none,
    },
  },
  {
    name: "manager",
    description: "Team management — employees, leave, attendance, performance",
    isProtected: false,
    permissions: {
      dashboard: viewOnly,
      employees: viewOnly,
      attendance: viewCreateEdit,
      leave: viewCreateEdit,
      assets: viewOnly,
      performance: full,
      reports: viewOnly,
      payroll: none,
      automations: none,
      onboarding: viewOnly,
      settings: none,
      roles: none,
    },
  },
  {
    name: "employee",
    description: "Employee self-service only",
    isProtected: false,
    permissions: Object.fromEntries(ROLE_MODULES.map((m) => [m, m === "dashboard" ? viewOnly : none])),
  },
];

export async function seedSystemRoles(): Promise<void> {
  for (const roleDef of SYSTEM_ROLES) {
    const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.name, roleDef.name));

    let roleId: string;
    if (!existing) {
      roleId = crypto.randomUUID();
      await db.insert(rolesTable).values({
        id: roleId,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
        isProtected: roleDef.isProtected,
      });
      console.log(`[seed] Created system role: ${roleDef.name}`);
    } else {
      roleId = existing.id;
      await db
        .update(rolesTable)
        .set({ description: roleDef.description, isSystem: true, isProtected: roleDef.isProtected })
        .where(eq(rolesTable.id, roleId));
    }

    const existingPerms = await db
      .select()
      .from(rolePermissionsTable)
      .where(eq(rolePermissionsTable.roleId, roleId));

    if (existingPerms.length === 0) {
      for (const [module, perm] of Object.entries(roleDef.permissions)) {
        await db.insert(rolePermissionsTable).values({
          id: crypto.randomUUID(),
          roleId,
          module,
          ...perm,
        });
      }
      console.log(`[seed] Seeded permissions for: ${roleDef.name}`);
    }
  }
}

export async function loadPermissionsForRole(
  roleId: string,
): Promise<Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }>> {
  const perms = await db
    .select()
    .from(rolePermissionsTable)
    .where(eq(rolePermissionsTable.roleId, roleId));

  return Object.fromEntries(
    perms.map((p) => [
      p.module,
      { view: p.canView, create: p.canCreate, edit: p.canEdit, delete: p.canDelete },
    ]),
  );
}
