import { z } from 'zod';

export const contactSchema = z.object({
  tenantName: z.string().min(1).max(200),
  primaryEmail: z.string().email().max(254).optional(),
  secondaryEmail: z.string().email().max(254).optional(),
  primaryPhone: z.string().max(30).optional(),
  secondaryPhone: z.string().max(30).optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;
