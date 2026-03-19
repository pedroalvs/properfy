import { z } from 'zod';
import { paginationSchema } from './pagination';

export const createPropertySchema = z.object({
  tenantId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  propertyCode: z.string().min(1).max(50).trim(),
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL']),
  street: z.string().min(1).max(300).trim(),
  addressLine2: z.string().max(200).trim().optional(),
  suburb: z.string().min(1).max(100).trim(),
  postcode: z.string().min(1).max(20).trim(),
  state: z.string().min(1).max(100).trim(),
  country: z.string().min(2).max(100).trim().default('AU'),
  notes: z.string().max(2000).optional(),
  rulesJson: z.record(z.unknown()).optional(),
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  propertyCode: z.string().min(1).max(50).trim().optional(),
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL']).optional(),
  street: z.string().min(1).max(300).trim().optional(),
  addressLine2: z.string().max(200).trim().nullable().optional(),
  suburb: z.string().min(1).max(100).trim().optional(),
  postcode: z.string().min(1).max(20).trim().optional(),
  state: z.string().min(1).max(100).trim().optional(),
  country: z.string().min(2).max(100).trim().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  rulesJson: z.record(z.unknown()).nullable().optional(),
});
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export const listPropertiesQuerySchema = paginationSchema.extend({
  tenantId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL']).optional(),
  search: z.string().max(200).optional(),
  hasCoordinates: z.coerce.boolean().optional(),
});
export type ListPropertiesQueryInput = z.infer<typeof listPropertiesQuerySchema>;
