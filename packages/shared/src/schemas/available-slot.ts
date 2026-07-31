import { z } from 'zod';

/**
 * A weekly availability slot: one day of the week plus a time window.
 *
 * This lives in its own leaf module — importing nothing from the rest of the
 * schemas — because it has two independent consumers that already depend on
 * each other: `rental-tenant-portal` (the tenant's decline flow, which writes
 * it) and `appointment` (the operator's command and the list response, which
 * read it). Defining it in either one makes the pair circular, and a schema
 * cycle fails at runtime with a TDZ `ReferenceError` that typechecking cannot
 * see, because types are erased and only the value imports remain.
 */
const HH_MM = /^\d{2}:\d{2}$/;

export const DAY_OF_WEEK = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

export const availableSlotSchema = z
  .object({
    dayOfWeek: DAY_OF_WEEK,
    start: z.string().regex(HH_MM, 'Must be HH:mm'),
    end: z.string().regex(HH_MM, 'Must be HH:mm'),
  })
  .refine((s) => s.start < s.end, { message: 'start must be before end' });

export type AvailableSlotSchema = z.infer<typeof availableSlotSchema>;
