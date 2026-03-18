import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { ServiceTypeFormData, ServiceTypeFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const REQUIRED_FIELDS: (keyof ServiceTypeFormData)[] = [
  'code',
  'name',
  'flowType',
];

function validateRequired(data: ServiceTypeFormData, fields: (keyof ServiceTypeFormData)[]): ServiceTypeFormErrors {
  const errors: ServiceTypeFormErrors = {};
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

export interface UseServiceTypeSaveReturn {
  save: (data: ServiceTypeFormData, serviceTypeId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: ServiceTypeFormData) => ServiceTypeFormErrors;
}

export function useServiceTypeSave(): UseServiceTypeSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: ServiceTypeFormData): ServiceTypeFormErrors => {
    return validateRequired(data, REQUIRED_FIELDS);
  }, []);

  const save = useCallback(async (data: ServiceTypeFormData, serviceTypeId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      if (serviceTypeId) {
        const { error } = await api.PATCH(`/v1/service-types/${serviceTypeId}` as any, { body: data as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST('/v1/service-types' as any, { body: data as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      }
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
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
