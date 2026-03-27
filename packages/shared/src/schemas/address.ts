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

export const addressSuggestionQuerySchema = z.object({
  q: z.string().min(3).max(200).trim(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
  country: z.string().trim().min(2).max(3).default('AU'),
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
