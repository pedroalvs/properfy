import { useState, useCallback } from 'react';
import { createAppointmentSchema, updateAppointmentSchema } from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { AppointmentFormData, AppointmentFormErrors } from '../types';

/** Map flat form fields to the nested shape expected by the shared Zod schema. */
function toSchemaPayload(data: AppointmentFormData, mode: 'create' | 'edit') {
  const contact = {
    tenantName: data.contactName.trim(),
    ...(data.contactEmail.trim() ? { primaryEmail: data.contactEmail.trim() } : {}),
    ...(data.contactPhone.trim() ? { primaryPhone: data.contactPhone.trim() } : {}),
  };

  if (mode === 'create') {
    return {
      branchId: data.branchId || undefined,
      propertyId: data.propertyId || undefined,
      serviceTypeId: data.serviceTypeId || undefined,
      scheduledDate: data.scheduledDate || undefined,
      timeSlot: data.timeSlot || undefined,
      contact,
      keyRequired: data.keyRequired,
      ...(data.meetingLocation.trim() ? { meetingLocation: data.meetingLocation.trim() } : {}),
      ...(data.keyLocation.trim() ? { keyLocation: data.keyLocation.trim() } : {}),
      ...(data.notes.trim() ? { notes: data.notes.trim() } : {}),
    };
  }

  return {
    ...(data.scheduledDate ? { scheduledDate: data.scheduledDate } : {}),
    ...(data.timeSlot ? { timeSlot: data.timeSlot } : {}),
    keyRequired: data.keyRequired,
    meetingLocation: data.meetingLocation.trim() || null,
    keyLocation: data.keyLocation.trim() || null,
    notes: data.notes.trim() || null,
    contact,
  };
}

/** Path-to-field mapping: Zod issue paths use schema field names, but the
 *  form state uses flat field names. */
const SCHEMA_PATH_TO_FORM_FIELD: Record<string, keyof AppointmentFormData> = {
  branchId: 'branchId',
  propertyId: 'propertyId',
  serviceTypeId: 'serviceTypeId',
  scheduledDate: 'scheduledDate',
  timeSlot: 'timeSlot',
  'contact.tenantName': 'contactName',
  'contact.primaryEmail': 'contactEmail',
  'contact.primaryPhone': 'contactPhone',
  keyRequired: 'keyRequired',
  meetingLocation: 'meetingLocation',
  keyLocation: 'keyLocation',
  notes: 'notes',
};

function isRequiredError(issue: { code?: string; message: string }): boolean {
  return issue.code === 'invalid_type' || issue.message === 'Required';
}

function zodErrorsToFormErrors(issues: { path: (string | number)[]; message: string; code?: string }[]): AppointmentFormErrors {
  const errors: AppointmentFormErrors = {};
  for (const issue of issues) {
    const path = issue.path.join('.');
    const formField = SCHEMA_PATH_TO_FORM_FIELD[path];
    if (formField && !errors[formField]) {
      errors[formField] = isRequiredError(issue) ? 'Required field' : issue.message;
    }
  }
  return errors;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  id?: string;
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
    const payload = toSchemaPayload(data, mode);
    const schema = mode === 'create' ? createAppointmentSchema : updateAppointmentSchema;
    const result = schema.safeParse(payload);
    const errors: AppointmentFormErrors = {};
    if (!result.success) {
      Object.assign(errors, zodErrorsToFormErrors(result.error.issues));
    }
    // propertyId is optional in the API schema (inline creation is an alternative),
    // but the form always requires selecting an existing property.
    if (mode === 'create' && !data.propertyId?.trim()) {
      errors.propertyId = errors.propertyId ?? 'Required field';
    }
    return errors;
  }, []);

  const save = useCallback(async (data: AppointmentFormData, appointmentId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      if (appointmentId) {
        const payload = toSchemaPayload(data, 'edit');
        const { error } = await api.PATCH(`/v1/appointments/${appointmentId}` as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        return { success: true, id: appointmentId };
      } else {
        const payload = toSchemaPayload(data, 'create');
        const { data: responseData, error } = await api.POST('/v1/appointments' as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        const createdId = (responseData as any)?.data?.id;
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        return { success: true, id: createdId };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient]);

  return { save, isSaving, validate };
}
