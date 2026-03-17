import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { contactSchema } from '@properfy/shared';
import { api } from '@/services/api';
import type { InspectorFormData, InspectorFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const REQUIRED_FIELDS: (keyof InspectorFormData)[] = ['name', 'email'];

function validateRequired(data: InspectorFormData, fields: (keyof InspectorFormData)[]): InspectorFormErrors {
  const errors: InspectorFormErrors = {};
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && !value.trim()) {
      errors[field] = REQUIRED_FIELD_MESSAGE;
    }
  }
  return errors;
}

function validateEmail(email: string): string | undefined {
  if (!email) return undefined;
  const result = contactSchema.shape.primaryEmail.safeParse(email);
  if (!result.success) return 'Invalid email';
  return undefined;
}

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface UseInspectorSaveReturn {
  save: (data: InspectorFormData, inspectorId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: InspectorFormData, mode: 'create' | 'edit') => InspectorFormErrors;
}

export function useInspectorSave(): UseInspectorSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: InspectorFormData, _mode: 'create' | 'edit'): InspectorFormErrors => {
    const errors: InspectorFormErrors = {};

    Object.assign(errors, validateRequired(data, REQUIRED_FIELDS));

    const emailError = validateEmail(data.email);
    if (emailError) errors.email = emailError;

    return errors;
  }, []);

  const save = useCallback(async (data: InspectorFormData, inspectorId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      const payload = {
        name: data.name,
        email: data.email,
        phone: data.phone || undefined,
        document: data.document || undefined,
        status: data.status || undefined,
        regions: data.regions ? data.regions.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        serviceTypes: data.serviceTypes ? data.serviceTypes.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      };

      if (inspectorId) {
        const { error } = await api.PATCH(`/v1/inspectors/${inspectorId}` as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST('/v1/inspectors' as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      }

      await queryClient.invalidateQueries({ queryKey: ['inspectors'] });
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
