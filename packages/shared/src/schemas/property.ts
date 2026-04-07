import { z } from 'zod';
import { paginationSchema } from './pagination';
import { propertyAddressSchema, propertyAddressUpdateSchema } from './address';

/**
 * Schema for property inspection rules stored in `rules_json`.
 *
 * All fields are optional — rules are progressively filled as more
 * information becomes available about a property.
 *
 * Uses `.passthrough()` for forward-compatibility: unknown keys are
 * preserved but typed fields are validated when present.
 */
export const propertyRulesSchema = z
  .object({
    /** Whether a key handover is required for property access. */
    keyRequired: z.boolean().optional(),
    /** Where the inspector should meet the tenant/agent. */
    meetingLocation: z.string().max(500).optional(),
    /** Physical location of the key (lockbox, agency office, etc.). */
    keyLocation: z.string().max(500).optional(),
    /** Instructions for accessing the property (gate codes, intercom, etc.). */
    accessInstructions: z.string().max(1000).optional(),
    /** Parking information for the inspector. */
    parkingInfo: z.string().max(500).optional(),
    /** Information about pets on premises. */
    petInfo: z.string().max(500).optional(),
    /** Any additional notes relevant to inspections at this property. */
    specialNotes: z.string().max(1000).optional(),
  })
  .passthrough();
export type PropertyRules = z.infer<typeof propertyRulesSchema>;

export const createPropertySchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    propertyCode: z.string().min(1).max(50).trim(),
    type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL']),
    notes: z.string().max(2000).optional(),
    rulesJson: propertyRulesSchema.optional(),
  })
  .merge(propertyAddressSchema);
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL']).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    rulesJson: propertyRulesSchema.nullable().optional(),
  })
  .merge(propertyAddressUpdateSchema);
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export const listPropertiesQuerySchema = paginationSchema.extend({
  tenantId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL']).optional(),
  search: z.string().max(200).optional(),
  hasCoordinates: z.coerce.boolean().optional(),
  nearLat: z.coerce.number().min(-90).max(90).optional(),
  nearLng: z.coerce.number().min(-180).max(180).optional(),
  nearRadiusKm: z.coerce.number().positive().max(500).optional(),
}).superRefine((data, ctx) => {
  const has = [data.nearLat, data.nearLng, data.nearRadiusKm].filter((v) => v !== undefined);
  if (has.length !== 0 && has.length !== 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'nearLat, nearLng and nearRadiusKm must all be provided together',
    });
  }
});
export type ListPropertiesQueryInput = z.infer<typeof listPropertiesQuerySchema>;
