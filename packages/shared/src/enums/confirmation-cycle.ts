import { z } from 'zod';

export const CycleStatus = z.enum(['PENDING', 'CONFIRMED', 'UNAVAILABLE', 'SUPERSEDED']);
export type CycleStatus = z.infer<typeof CycleStatus>;

export const CycleConfirmationSource = z.enum(['TENANT_PORTAL', 'OPERATOR_FORCED', 'TENANT_RESCHEDULE']);
export type CycleConfirmationSource = z.infer<typeof CycleConfirmationSource>;

export const CycleInvalidatedReason = z.enum(['DATE_CHANGED', 'TIME_CHANGED', 'APPOINTMENT_REOPENED', 'TENANT_RESCHEDULE']);
export type CycleInvalidatedReason = z.infer<typeof CycleInvalidatedReason>;
