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
