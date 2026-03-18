import type { NotificationChannel } from '@properfy/shared';

export interface NotificationTemplate {
  id: string;
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
  search: string;
  channel: string;
  active: string;
}

export const DEFAULT_TEMPLATE_FILTERS: TemplateFiltersState = {
  search: '',
  channel: '',
  active: '',
};

export const ALLOWED_VARIABLES = [
  'tenant_name',
  'property_address',
  'scheduled_date',
  'time_slot',
  'inspector_name',
  'confirmation_link',
  'agency_name',
  'agency_phone',
  'appointment_code',
  'reschedule_link',
] as const;

export type AllowedVariable = typeof ALLOWED_VARIABLES[number];

export const SAMPLE_DATA: Record<AllowedVariable, string> = {
  tenant_name: 'John Smith',
  property_address: '123 Main St, Sydney NSW 2000',
  scheduled_date: '2026-04-15',
  time_slot: '09:00 - 12:00',
  inspector_name: 'Jane Doe',
  confirmation_link: 'https://app.properfy.com/portal/abc123',
  agency_name: 'ABC Realty',
  agency_phone: '+61 2 9876 5432',
  appointment_code: 'VST-001',
  reschedule_link: 'https://app.properfy.com/portal/abc123/reschedule',
};
