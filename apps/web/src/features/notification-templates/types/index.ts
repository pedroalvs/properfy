import type { NotificationChannel } from '@properfy/shared';

export interface NotificationTemplate {
  id: string;
  tenantId: string | null;
  code: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  active: boolean;
  requiredVariables: string[];
  createdAt: string;
  updatedAt: string;
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
