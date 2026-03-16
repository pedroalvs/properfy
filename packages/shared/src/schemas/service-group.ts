import { z } from 'zod';

export const createServiceGroupSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  appointmentIds: z.array(z.string().uuid()).min(1),
  priorityMode: z.enum(['STANDARD', 'URGENT']).default('STANDARD'),
  scheduledDate: z.string().date().optional(),
  region: z.string().max(200).optional(),
});
export type CreateServiceGroupInput = z.infer<typeof createServiceGroupSchema>;

export const acceptOfferSchema = z.object({
  inspectorId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});
export type AcceptOfferInput = z.infer<typeof acceptOfferSchema>;
