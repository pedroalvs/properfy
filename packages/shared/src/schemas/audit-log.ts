import { z } from 'zod';
import { paginationSchema } from './pagination';

export const listAuditLogsQuerySchema = paginationSchema.extend({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  q: z.string().min(1).max(200).optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
