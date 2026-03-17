import { useState, useCallback } from 'react';
import { contactSchema } from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { AppointmentFormData, AppointmentFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const CREATE_REQUIRED_FIELDS: (keyof AppointmentFormData)[] = [
  'branchId',
  'propertyId',
  'serviceTypeId',
  'scheduledDate',
  'timeSlot',
  'contactName',
];

function validateRequired(data: AppointmentFormData, fields: (keyof AppointmentFormData)[]): AppointmentFormErrors {
  const errors: AppointmentFormErrors = {};
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

export interface UseAppointmentSaveReturn {
  save: (data: AppointmentFormData, appointmentId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: AppointmentFormData, mode: 'create' | 'edit') => AppointmentFormErrors;
}

export function useAppointmentSave(): UseAppointmentSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: AppointmentFormData, mode: 'create' | 'edit'): AppointmentFormErrors => {
    const errors: AppointmentFormErrors = {};

    if (mode === 'create') {
      Object.assign(errors, validateRequired(data, CREATE_REQUIRED_FIELDS));
    } else {
      Object.assign(errors, validateRequired(data, ['contactName']));
    }

    const emailError = validateEmail(data.contactEmail);
    if (emailError) errors.contactEmail = emailError;

    return errors;
  }, []);

  const save = useCallback(async (data: AppointmentFormData, appointmentId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      if (appointmentId) {
        const { error } = await api.PATCH(`/v1/appointments/${appointmentId}` as any, { body: data as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST('/v1/appointments' as any, { body: data as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      }
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
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
