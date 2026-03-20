import { z } from 'zod';
import { paginationSchema } from './pagination';

export const createInspectorSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().max(254),
  phone: z.string().max(20).optional(),
  paymentSettings: z.record(z.unknown()).default({}),
  regions: z.array(z.string()).default([]),
  serviceTypes: z.array(z.string().uuid()).default([]),
  clientEligibility: z.array(z.string().uuid()).default([]),
});
export type CreateInspectorInput = z.infer<typeof createInspectorSchema>;

export const updateInspectorSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(20).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  paymentSettings: z.record(z.unknown()).optional(),
  regions: z.array(z.string()).optional(),
  serviceTypes: z.array(z.string().uuid()).optional(),
  clientEligibility: z.array(z.string().uuid()).optional(),
});
export type UpdateInspectorInput = z.infer<typeof updateInspectorSchema>;

export const listInspectorsQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().max(200).optional(),
  region: z.string().optional(),
  serviceTypeId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
});
export type ListInspectorsQueryInput = z.infer<typeof listInspectorsQuerySchema>;

export const createAvailabilitySlotSchema = z.object({
  inspectorId: z.string().uuid().optional(),
  date: z.string().date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
  region: z.string().optional(),
  regionJson: z.record(z.unknown()).optional(),
  capacity: z.number().int().min(1).default(1),
});
export type CreateAvailabilitySlotInput = z.infer<typeof createAvailabilitySlotSchema>;

export const updateAvailabilitySlotSchema = z.object({
  date: z.string().date().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional(),
  region: z.string().optional(),
  regionJson: z.record(z.unknown()).nullable().optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.enum(['AVAILABLE', 'BOOKED', 'CANCELLED']).optional(),
});
export type UpdateAvailabilitySlotInput = z.infer<typeof updateAvailabilitySlotSchema>;

export const linkInspectorToUserSchema = z.object({
  userId: z.string().uuid(),
});
export type LinkInspectorToUserInput = z.infer<typeof linkInspectorToUserSchema>;

export const listAvailabilitySlotsQuerySchema = paginationSchema.extend({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  status: z.enum(['AVAILABLE', 'BOOKED', 'CANCELLED']).optional(),
});
export type ListAvailabilitySlotsQueryInput = z.infer<typeof listAvailabilitySlotsQuerySchema>;
