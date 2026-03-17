import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { ServiceGroupFormData, ServiceGroupFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const REQUIRED_FIELDS: (keyof ServiceGroupFormData)[] = ['name', 'priorityMode'];

function validateRequired(data: ServiceGroupFormData, fields: (keyof ServiceGroupFormData)[]): ServiceGroupFormErrors {
  const errors: ServiceGroupFormErrors = {};
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

export interface UseServiceGroupSaveReturn {
  save: (data: ServiceGroupFormData, serviceGroupId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: ServiceGroupFormData, mode: 'create' | 'edit') => ServiceGroupFormErrors;
}

export function useServiceGroupSave(): UseServiceGroupSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: ServiceGroupFormData, _mode: 'create' | 'edit'): ServiceGroupFormErrors => {
    const errors: ServiceGroupFormErrors = {};
    Object.assign(errors, validateRequired(data, REQUIRED_FIELDS));
    return errors;
  }, []);

  const save = useCallback(async (data: ServiceGroupFormData, serviceGroupId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      if (serviceGroupId) {
        const { error } = await api.PATCH(`/v1/service-groups/${serviceGroupId}` as any, { body: data as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST('/v1/service-groups' as any, { body: data as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      }
      queryClient.invalidateQueries({ queryKey: ['service-groups'] });
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
