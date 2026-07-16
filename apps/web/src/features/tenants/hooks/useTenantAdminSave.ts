import { useState, useCallback } from 'react';
import { appointmentCodePrefixSchema } from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { TenantAdminFormData, TenantAdminFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';
const PREFIX_FORMAT_MESSAGE = 'Use 3–4 letters or numbers';
const PREFIX_CONFLICT_MESSAGE = 'This prefix is already in use by another agency';

const REQUIRED_FIELDS: (keyof TenantAdminFormData)[] = [
  'name',
  'legalName',
  'currency',
];

export interface ValidateOptions {
  /** Prefix is required on create; on edit it may be blank for legacy tenants
   *  pending backfill (so unrelated edits aren't blocked). */
  isCreate?: boolean;
}

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
  validate: (data: TenantAdminFormData, opts?: ValidateOptions) => TenantAdminFormErrors;
}

export function useTenantAdminSave(): UseTenantAdminSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: TenantAdminFormData, opts?: ValidateOptions): TenantAdminFormErrors => {
    const isCreate = opts?.isCreate ?? true;
    const errors = validateRequired(data, REQUIRED_FIELDS);

    const prefix = data.appointmentCodePrefix.trim();
    if (!prefix) {
      // Required on create; allowed empty on edit (legacy tenants).
      if (isCreate) errors.appointmentCodePrefix = REQUIRED_FIELD_MESSAGE;
    } else if (!appointmentCodePrefixSchema.safeParse(prefix).success) {
      // Reuse the shared schema (trim/format) instead of re-encoding the rule.
      errors.appointmentCodePrefix = PREFIX_FORMAT_MESSAGE;
    }
    return errors;
  }, []);

  const save = useCallback(async (data: TenantAdminFormData, tenantId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      // Settings flags are nested under `settings` (deep-merged server-side into
      // settings_json); scalar fields stay top-level. `notes` is not part of the
      // API contract and is excluded from the payload.
      const { emailSendingEnabled, appointmentCodePrefix, notes: _notes, ...rest } = data;
      // Only send the prefix when present (uppercased to match the backend). On
      // edit, an empty value (legacy tenant) is omitted so the field is untouched.
      const trimmedPrefix = appointmentCodePrefix.trim().toUpperCase();
      const settings = { emailSendingEnabled };

      const { error } = tenantId
        ? await api.PATCH('/v1/tenants/{tenantId}', {
            params: { path: { tenantId } },
            body: { ...rest, settings, ...(trimmedPrefix ? { appointmentCodePrefix: trimmedPrefix } : {}) },
          })
        : await api.POST('/v1/tenants', {
            body: { ...rest, settings, appointmentCodePrefix: trimmedPrefix },
          });

      type ApiErrorEnvelope = { error?: { code?: string; message?: string } };
      const errorEnvelope = error as ApiErrorEnvelope | undefined;
      if (error) {
        // Surface the prefix-uniqueness conflict inline rather than as a generic snackbar.
        if (errorEnvelope?.error?.code === 'TENANT_PREFIX_CONFLICT') {
          return { success: false, fieldErrors: { appointmentCodePrefix: PREFIX_CONFLICT_MESSAGE } };
        }
        throw new Error(errorEnvelope?.error?.message ?? 'Request failed');
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
