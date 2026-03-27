import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { contactSchema, createInspectorSchema, updateInspectorSchema } from '@properfy/shared';
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

function parseDelimitedValues(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseServiceTypeIds(value: string): string[] | undefined {
  const parsed = parseDelimitedValues(value);
  return parsed.length > 0 ? parsed : undefined;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  errorCode?: string;
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

    const serviceTypes = parseServiceTypeIds(data.serviceTypes);
    const schema = _mode === 'create' ? createInspectorSchema : updateInspectorSchema;
    const result = schema.safeParse({
      name: data.name.trim() || undefined,
      email: data.email.trim() || undefined,
      phone: data.phone.trim() || undefined,
      status: data.status || undefined,
      regions: parseDelimitedValues(data.regions),
      serviceTypes,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        if (path.startsWith('serviceTypes') && !errors.serviceTypes) {
          errors.serviceTypes = 'Select valid service types';
        }
      }
    }

    return errors;
  }, []);

  const save = useCallback(async (data: InspectorFormData, inspectorId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      const payload = {
        name: data.name.trim(),
        email: data.email.trim(),
        phone: data.phone.trim() || undefined,
        status: data.status || undefined,
        regions: parseDelimitedValues(data.regions),
        serviceTypes: parseServiceTypeIds(data.serviceTypes),
      };

      let apiError: { error?: { code?: string; message?: string } } | undefined;
      if (inspectorId) {
        const { error } = await api.PATCH(`/v1/inspectors/${inspectorId}` as any, { body: payload as any });
        apiError = error as any;
      } else {
        const { error } = await api.POST('/v1/inspectors' as any, { body: payload as any });
        apiError = error as any;
      }

      if (apiError) {
        const code = apiError?.error?.code ?? 'UNKNOWN';
        const message = apiError?.error?.message ?? 'Request failed';
        return { success: false, error: message, errorCode: code };
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
