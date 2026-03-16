import { z } from 'zod';

export const restrictionSchema = z.object({
  type: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  source: z.enum(['TENANT', 'CLIENT', 'OPERATOR']),
  activeFrom: z.string().datetime().optional(),
  activeTo: z.string().datetime().optional(),
});
export type RestrictionInput = z.infer<typeof restrictionSchema>;
