import { z } from "zod";
import { AUTH_MODES, GUEST_ACCESS, MAX_PASSWORD_LENGTH } from "./auth";

export const authSessionSchema = z.object({
  authenticated: z.boolean(),
  canEdit: z.boolean(),
  guest: z.enum(GUEST_ACCESS),
  mode: z.enum(AUTH_MODES),
  user: z.string().nullable(),
});

/** Empty passwords are allowed through so they cost the same argon2 check as any wrong one. */
export const loginRequestSchema = z.object({
  password: z
    .string({ error: "password must be a string" })
    .max(MAX_PASSWORD_LENGTH, `password must be at most ${MAX_PASSWORD_LENGTH} characters`),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
