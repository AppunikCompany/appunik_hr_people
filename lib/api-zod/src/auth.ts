import { z } from "zod/v4";

export const UserRoleSchema = z.enum(["super_admin", "hr_admin", "it_admin", "manager", "employee"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

const ModulePermissionSchema = z.object({
  view: z.boolean(),
  create: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
});

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
  role: z.string().optional().default("employee"),
  permissions: z.record(z.string(), ModulePermissionSchema).optional().default({}),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type ModulePermission = z.infer<typeof ModulePermissionSchema>;
