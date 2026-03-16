import { z } from 'zod';
import { RestrictionSource } from '../enums/appointment';

export const restrictionSchema = z.object({
  isHome: z.boolean(),
  unavailableDays: z.array(z.string().date()).optional(),
  unavailableHours: z.array(z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, 'Must be HH:mm-HH:mm format')).optional(),
  notes: z.string().max(500).optional(),
  source: z.nativeEnum(RestrictionSource),
});
export type RestrictionInput = z.infer<typeof restrictionSchema>;
