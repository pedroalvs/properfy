import { z } from 'zod';

export const setupTotpResponseSchema = z.object({
  secret: z.string().min(1),
  qrUri: z.string().min(1),
});
export type SetupTotpResponse = z.infer<typeof setupTotpResponseSchema>;

export const confirmTotpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Must be a 6-digit code'),
});
export type ConfirmTotpInput = z.infer<typeof confirmTotpSchema>;
