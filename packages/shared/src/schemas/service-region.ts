import { z } from 'zod';
import { paginationSchema } from './pagination';

const ringSchema = z.array(z.tuple([z.number(), z.number()])).min(4);

export const geojsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(ringSchema).min(1),
});

export const geojsonMultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(
    z.array(ringSchema).min(1),
  ).min(1),
});

export const geojsonGeometrySchema = geojsonPolygonSchema.or(geojsonMultiPolygonSchema);

export const createServiceRegionSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  geojson: geojsonGeometrySchema,
  color: z.string().max(20).trim().optional(),
  tenantId: z.string().uuid().optional(),
});
export type CreateServiceRegionInput = z.infer<typeof createServiceRegionSchema>;

export const updateServiceRegionSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  geojson: geojsonGeometrySchema.optional(),
  color: z.string().max(20).trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export type UpdateServiceRegionInput = z.infer<typeof updateServiceRegionSchema>;

export const listServiceRegionsQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().max(255).optional(),
  /** Optional tenant filter. Platform-wide roles (AM) use it to narrow the
   *  list; tenant-scoped roles have it forced to their JWT tenantId. */
  tenantId: z.string().uuid().optional(),
});
export type ListServiceRegionsQueryInput = z.infer<typeof listServiceRegionsQuerySchema>;

export const resolveRegionsSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(200),
  /** Required for cross-tenant AM/OP callers whose JWT carries no tenantId. */
  tenantId: z.string().uuid().optional(),
});
export type ResolveRegionsInput = z.infer<typeof resolveRegionsSchema>;

export const resolvedRegionItemSchema = z.object({
  regionId: z.string().uuid(),
  regionName: z.string(),
  color: z.string(),
  matchedAppointmentCount: z.number(),
  inspectorCount: z.number(),
});

export const resolveRegionsResponseSchema = z.object({
  regions: z.array(resolvedRegionItemSchema),
  totalAppointments: z.number(),
  unmatchedAppointmentIds: z.array(z.string().uuid()),
});
export type ResolveRegionsResponse = z.infer<typeof resolveRegionsResponseSchema>;
