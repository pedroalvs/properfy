import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { ServiceRegionFormData, ServiceRegionFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const REQUIRED_FIELDS: (keyof ServiceRegionFormData)[] = [
  'name',
  'country',
  'state',
];

function validateRequired(data: ServiceRegionFormData, fields: (keyof ServiceRegionFormData)[]): ServiceRegionFormErrors {
  const errors: ServiceRegionFormErrors = {};
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

export interface UseServiceRegionSaveReturn {
  save: (data: ServiceRegionFormData, regionId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: ServiceRegionFormData) => ServiceRegionFormErrors;
}

export function useServiceRegionSave(): UseServiceRegionSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: ServiceRegionFormData): ServiceRegionFormErrors => {
    return validateRequired(data, REQUIRED_FIELDS);
  }, []);

  const save = useCallback(async (data: ServiceRegionFormData, regionId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      const payload = {
        name: data.name.trim(),
        country: data.country,
        state: data.state.trim(),
        suburbIds: data.suburbIds,
        status: data.status || undefined,
      };

      if (regionId) {
        const { error } = await api.PATCH(`/v1/service-regions/${regionId}` as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST('/v1/service-regions' as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      }
      queryClient.invalidateQueries({ queryKey: ['service-regions'] });
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
