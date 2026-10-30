import { z } from 'zod';

export const addressSchema = z.object({
  street: z.string().min(1).max(300),
  number: z.string().max(20).optional(),
  complement: z.string().max(100).optional(),
  neighbourhood: z.string().max(100).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(100),
  postcode: z.string().min(1).max(20),
  country: z.string().min(2).max(100).default('AU'),
});
export type AddressInput = z.infer<typeof addressSchema>;

// Branch address schema — structured replacement for freeform address_json.
// latitude/longitude are intentionally absent: branch coordinates come only from
// permanent-mode geocoding on the backend (Mapbox terms), never from the client.
// A client that still posts them has the keys stripped by z.object (strip is the
// default), so an old client does not 400. MUST stay a plain z.object with no
// top-level .transform/.refine/.superRefine/.passthrough/.strict so F01 can
// derive it with `.extend(...)` (a ZodEffects has no `.extend`).
export const branchAddressSchema = z.object({
  street: z.string().min(1).max(200),
  number: z.string().max(20).optional(),
  complement: z.string().max(200).optional(),
  suburb: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postcode: z.string().min(1).max(20),
  country: z.string().length(2).default('AU'), // ISO 3166-1 alpha-2
});
export type BranchAddressInput = z.infer<typeof branchAddressSchema>;

// Property address schema — flat address fields for property entities.
// Aligned with branchAddressSchema validation constraints but keeps the
// property-specific field set (addressLine2 instead of number/complement,
// no city field) to preserve the existing API contract and DB columns.
export const propertyAddressSchema = z.object({
  street: z.string().min(1).max(300).trim(),
  addressLine2: z.string().max(200).trim().optional(),
  suburb: z.string().min(1).max(100).trim(),
  postcode: z.string().min(1).max(20).trim(),
  state: z.string().min(1).max(100).trim(),
  country: z.string().min(2).max(100).trim().default('AU'),
});
export type PropertyAddressInput = z.infer<typeof propertyAddressSchema>;

// Partial version for update operations (all fields optional)
export const propertyAddressUpdateSchema = z.object({
  street: z.string().min(1).max(300).trim().optional(),
  addressLine2: z.string().max(200).trim().nullable().optional(),
  suburb: z.string().min(1).max(100).trim().optional(),
  postcode: z.string().min(1).max(20).trim().optional(),
  state: z.string().min(1).max(100).trim().optional(),
  country: z.string().min(2).max(100).trim().optional(),
});
export type PropertyAddressUpdateInput = z.infer<typeof propertyAddressUpdateSchema>;

export const addressSuggestionQuerySchema = z.object({
  q: z.string().min(3).max(200).trim(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
  country: z.string().trim().min(2).max(100).optional(),
});
export type AddressSuggestionQueryInput = z.infer<typeof addressSuggestionQuerySchema>;

export const addressSuggestionSchema = z.object({
  formattedAddress: z.string().min(1).max(500),
  street: z.string().min(1).max(300),
  suburb: z.string().max(100),
  postcode: z.string().max(20),
  state: z.string().min(1).max(100),
  country: z.string().min(2).max(100),
  latitude: z.number(),
  longitude: z.number(),
  provider: z.literal('MAPBOX'),
});
export type AddressSuggestion = z.infer<typeof addressSuggestionSchema>;
