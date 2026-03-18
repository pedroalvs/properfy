import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { PropertyFormData, PropertyFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const CREATE_REQUIRED_FIELDS: (keyof PropertyFormData)[] = [
  'propertyCode',
  'type',
  'street',
  'suburb',
  'postcode',
  'state',
];

const EDIT_REQUIRED_FIELDS: (keyof PropertyFormData)[] = [
  'street',
  'suburb',
  'postcode',
  'state',
];

function validateRequired(data: PropertyFormData, fields: (keyof PropertyFormData)[]): PropertyFormErrors {
  const errors: PropertyFormErrors = {};
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
  id?: string;
}

export interface UsePropertySaveReturn {
  save: (data: PropertyFormData, propertyId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: PropertyFormData, mode: 'create' | 'edit') => PropertyFormErrors;
}

export function usePropertySave(): UsePropertySaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: PropertyFormData, mode: 'create' | 'edit'): PropertyFormErrors => {
    const errors: PropertyFormErrors = {};

    if (mode === 'create') {
      Object.assign(errors, validateRequired(data, CREATE_REQUIRED_FIELDS));
    } else {
      Object.assign(errors, validateRequired(data, EDIT_REQUIRED_FIELDS));
    }

    return errors;
  }, []);

  const save = useCallback(async (data: PropertyFormData, propertyId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      let newId: string | undefined;
      if (propertyId) {
        const { error } = await api.PATCH(`/v1/properties/${propertyId}` as any, { body: data as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { data: responseData, error } = await api.POST('/v1/properties' as any, { body: data as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        newId = (responseData as any)?.id;
      }
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      return { success: true, id: newId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient]);

  return { save, isSaving, validate };
}
