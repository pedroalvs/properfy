import type { NotificationChannel, NotificationClass } from '@properfy/shared';

// Re-export shared constants for use within this feature
export {
  ALLOWED_VARIABLES,
  type AllowedVariable,
  SAMPLE_DATA,
  PROTECTED_TEMPLATE_CODES,
  isProtectedTemplateCode,
  TEMPLATE_VARIABLES,
  type TemplateVariableSpec,
  type MandatoryTemplateCode,
} from '@properfy/shared';

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
