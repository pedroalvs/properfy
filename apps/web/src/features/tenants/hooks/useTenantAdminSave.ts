import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { TenantAdminFormData, TenantAdminFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const REQUIRED_FIELDS: (keyof TenantAdminFormData)[] = [
  'name',
  'legalName',
  'timezone',
  'currency',
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
    return validateRequired(data, REQUIRED_FIELDS);
  }, []);

  const save = useCallback(async (data: TenantAdminFormData, tenantId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      // Settings flags are nested under `settings` (deep-merged server-side into
      // settings_json); scalar fields stay top-level.
      const { emailSendingEnabled, ...rest } = data;
      const body = { ...rest, settings: { emailSendingEnabled } };
      if (tenantId) {
        const { error } = await api.PATCH(`/v1/tenants/${tenantId}` as any, { body: body as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST('/v1/tenants' as any, { body: body as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
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
