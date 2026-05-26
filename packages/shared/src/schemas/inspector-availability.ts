import { z } from 'zod';

const dayCellSchema = z.object({ am: z.boolean(), pm: z.boolean() });

export const availabilityTemplateSchema = z.object({
  mon: dayCellSchema,
  tue: dayCellSchema,
  wed: dayCellSchema,
  thu: dayCellSchema,
  fri: dayCellSchema,
  sat: dayCellSchema,
  sun: dayCellSchema,
});

export const availabilityOverrideMapSchema = z.object({
  mon: dayCellSchema,
  tue: dayCellSchema,
  wed: dayCellSchema,
  thu: dayCellSchema,
  fri: dayCellSchema,
  sat: dayCellSchema,
  sun: dayCellSchema,
});

export const inspectorAvailabilityResponseSchema = z.object({
  template: availabilityTemplateSchema,
  overrides: availabilityOverrideMapSchema,
});

export type DayCell = z.infer<typeof dayCellSchema>;
export type AvailabilityTemplate = z.infer<typeof availabilityTemplateSchema>;
export type AvailabilityOverrideMap = z.infer<typeof availabilityOverrideMapSchema>;
export type InspectorAvailabilityResponse = z.infer<typeof inspectorAvailabilityResponseSchema>;
