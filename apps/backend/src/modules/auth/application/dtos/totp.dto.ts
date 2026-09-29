import { z } from 'zod';

/** POST /v1/auth/2fa/setup response — provisioning secret + otpauth URI for the QR code. */
export const totpSetupResponseSchema = z.object({
  secret: z.string(),
  qrUri: z.string(),
});

/** POST /v1/auth/2fa/confirm request body — the 6-digit code from the authenticator app. */
export const confirmTotpBodySchema = z.object({
  totpCode: z.string().length(6),
});

/**
 * POST /v1/auth/2fa/disable request body — the current password re-authenticates
 * the user before turning 2FA off (a session hijacker should not be able to
 * silently disable it). Lost-authenticator recovery goes through the admin reset.
 */
export const disableTotpBodySchema = z.object({
  currentPassword: z.string().min(1),
});
