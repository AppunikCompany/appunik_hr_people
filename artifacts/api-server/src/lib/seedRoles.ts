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
    name: "employee",
    description: "Employee self-service — own leave, attendance, and profile only",
    isProtected: false,
    permissions: Object.fromEntries(
      ROLE_MODULES.map((m) => [
        m,
        m === "dashboard" || m === "leave" || m === "attendance" ? viewOnly : none,
      ])
    ),
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

    const existingMap = new Map(existingPerms.map((p) => [p.module, p]));

    for (const [module, perm] of Object.entries(roleDef.permissions)) {
      const existing = existingMap.get(module);
      if (!existing) {
        // Insert new module permission
        await db.insert(rolePermissionsTable).values({
          id: crypto.randomUUID(),
          roleId,
          module,
          ...perm,
        });
      } else if (
        existing.canView !== perm.canView ||
        existing.canCreate !== perm.canCreate ||
        existing.canEdit !== perm.canEdit ||
        existing.canDelete !== perm.canDelete
      ) {
        // Update if the definition has changed (keeps system roles in sync with code)
        await db.update(rolePermissionsTable)
          .set(perm)
          .where(eq(rolePermissionsTable.id, existing.id));
      }
    }
    console.log(`[seed] Synced permissions for: ${roleDef.name}`);
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
