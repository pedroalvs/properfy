import { z } from 'zod';
import { paginationSchema } from './pagination';

const geojsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(
    z.array(z.tuple([z.number(), z.number()])).min(4),
  ).min(1),
});

export const createServiceRegionSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  geojson: geojsonPolygonSchema,
  color: z.string().max(20).trim().optional(),
});
export type CreateServiceRegionInput = z.infer<typeof createServiceRegionSchema>;

export const updateServiceRegionSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  geojson: geojsonPolygonSchema.optional(),
  color: z.string().max(20).trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export type UpdateServiceRegionInput = z.infer<typeof updateServiceRegionSchema>;

export const listServiceRegionsQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().max(255).optional(),
});
export type ListServiceRegionsQueryInput = z.infer<typeof listServiceRegionsQuerySchema>;

export const resolveRegionsSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(25),
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
