import { z } from 'zod';
import { ianaTimezoneSchema } from '../utils/timezone';

/**
 * Canonical password policy shared across backend validation and the web/PWA
 * reset flows: 8–128 chars with uppercase, lowercase, number and special
 * character. Kept in one place so the clients cannot drift from the API.
 */
export const passwordFieldSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Z]/, 'Must contain uppercase letter')
  .regex(/[a-z]/, 'Must contain lowercase letter')
  .regex(/[0-9]/, 'Must contain number')
  .regex(/[^A-Za-z0-9]/, 'Must contain special character');

/**
 * Client-facing summary of {@link passwordFieldSchema}, including the 128-char
 * maximum, so the web and PWA reset flows show the same policy copy.
 */
export const PASSWORD_REQUIREMENTS_MESSAGE =
  'Use 8–128 characters with uppercase, lowercase, number and special character.';

export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(128),
  totpCode: z.string().length(6).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

// Self-service profile update (PATCH /v1/me). Timezone only for now; scoped to
// cross-tenant roles (AM/OP/INSP) — CL_* users inherit the agency timezone and
// the use case rejects this call for them.
export const updateMeSchema = z.object({
  timezone: ianaTimezoneSchema,
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordFieldSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordFieldSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
