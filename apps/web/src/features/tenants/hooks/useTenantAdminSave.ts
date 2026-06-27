import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { TenantAdminFormData, TenantAdminFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';
const PREFIX_FORMAT_MESSAGE = 'Use 3–4 letters or numbers';
const PREFIX_CONFLICT_MESSAGE = 'This prefix is already in use by another agency';

// Mirrors the backend appointmentCodePrefixSchema (3–4 alphanumeric, uppercased).
const PREFIX_PATTERN = /^[A-Z0-9]{3,4}$/;

const REQUIRED_FIELDS: (keyof TenantAdminFormData)[] = [
  'name',
  'legalName',
  'timezone',
  'currency',
  'appointmentCodePrefix',
];

function validateRequired(data: TenantAdminFormData, fields: (keyof TenantAdminFormData)[]): TenantAdminFormErrors {
  const errors: TenantAdminFormErrors = {};
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && !value.trim()) {
      errors[field] = REQUIRED_FIELD_MESSAGE;
    }
  }
  return errors;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  /** Field-level errors (e.g. a 409 prefix conflict) to render inline. */
  fieldErrors?: TenantAdminFormErrors;
}

export interface UseTenantAdminSaveReturn {
  save: (data: TenantAdminFormData, tenantId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: TenantAdminFormData) => TenantAdminFormErrors;
}

export function useTenantAdminSave(): UseTenantAdminSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: TenantAdminFormData): TenantAdminFormErrors => {
    const errors = validateRequired(data, REQUIRED_FIELDS);
    // Format check only when present (required check already flags empty).
    const prefix = data.appointmentCodePrefix.trim().toUpperCase();
    if (prefix && !PREFIX_PATTERN.test(prefix)) {
      errors.appointmentCodePrefix = PREFIX_FORMAT_MESSAGE;
    }
    return errors;
  }, []);

  const save = useCallback(async (data: TenantAdminFormData, tenantId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      // Settings flags are nested under `settings` (deep-merged server-side into
      // settings_json); scalar fields stay top-level. The prefix is uppercased to
      // match the backend's normalization and the uniqueness constraint.
      const { emailSendingEnabled, appointmentCodePrefix, ...rest } = data;
      const body = {
        ...rest,
        appointmentCodePrefix: appointmentCodePrefix.trim().toUpperCase(),
        settings: { emailSendingEnabled },
      };
      const { error } = tenantId
        ? await api.PATCH(`/v1/tenants/${tenantId}` as any, { body: body as any })
        : await api.POST('/v1/tenants' as any, { body: body as any });
      if (error) {
        // Surface the prefix-uniqueness conflict inline rather than as a generic snackbar.
        if ((error as any)?.error?.code === 'TENANT_PREFIX_CONFLICT') {
          return { success: false, fieldErrors: { appointmentCodePrefix: PREFIX_CONFLICT_MESSAGE } };
        }
        throw new Error((error as any)?.error?.message ?? 'Request failed');
      }
      queryClient.invalidateQueries({ queryKey: ['tenant-admins'] });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient]);

  return { save, isSaving, validate };
}
