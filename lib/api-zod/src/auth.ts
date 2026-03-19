import { z } from "zod/v4";

export const UserRoleSchema = z.enum(["super_admin", "hr_admin", "it_admin", "manager", "employee"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
  role: UserRoleSchema.optional().default("employee"),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;
