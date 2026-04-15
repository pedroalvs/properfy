import type { NotificationChannel, NotificationClass } from '@properfy/shared';

export interface NotificationTemplate {
  id: string;
  tenantId: string | null;
  code: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  active: boolean;
  /** Feature 018: classification — TRANSACTIONAL templates cannot be reclassified. */
  notificationClass: NotificationClass;
  requiredVariables: string[];
  createdAt: string;
  updatedAt: string;
}

/** Feature 018: protected codes that must remain TRANSACTIONAL. UI mirrors backend. */
export const PROTECTED_TEMPLATE_CODES: readonly string[] = [
  'INSPECTION_CONFIRMED',
  'INSPECTION_RESCHEDULED',
  'INSPECTION_CANCELLED',
  'INSPECTION_UNAVAILABILITY_REPORTED',
] as const;

export function isProtectedTemplateCode(code: string): boolean {
  return PROTECTED_TEMPLATE_CODES.includes(code);
}

export interface TemplateFormData {
  subject: string;
  body: string;
  active: boolean;
}

export interface TemplateFormErrors {
  subject?: string;
  body?: string;
}

export interface TemplateFiltersState {
  templateCode: string;
  channel: string;
  includeDefaults: 'true' | 'false';
}

export const DEFAULT_TEMPLATE_FILTERS: TemplateFiltersState = {
  templateCode: '',
  channel: '',
  includeDefaults: 'true',
};

export const ALLOWED_VARIABLES = [
  'tenantName',
  'propertyAddress',
  'scheduledDate',
  'timeSlot',
  'inspectorName',
  'confirmationLink',
  'agencyName',
  'agencyPhone',
  'appointmentCode',
  'rescheduleLink',
] as const;

export type AllowedVariable = typeof ALLOWED_VARIABLES[number];

export const SAMPLE_DATA: Record<AllowedVariable, string> = {
  tenantName: 'John Smith',
  propertyAddress: '123 Main St, Sydney NSW 2000',
  scheduledDate: '2026-04-15',
  timeSlot: '09:00 - 12:00',
  inspectorName: 'Jane Doe',
  confirmationLink: 'https://app.properfy.com/portal/abc123',
  agencyName: 'ABC Realty',
  agencyPhone: '+61 2 9876 5432',
  appointmentCode: 'VST-001',
  rescheduleLink: 'https://app.properfy.com/portal/abc123/reschedule',
};
