import { z } from "zod/v4";

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;
