import { useState, useCallback } from 'react';
import { contactSchema, AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import type { AppointmentFormData, AppointmentFormErrors } from '../types';
import type { AppointmentDetail } from '../types';
import { MOCK_APPOINTMENTS } from '../mocks/appointments';

const REQUIRED_FIELD_MESSAGE = 'Campo obrigatório';

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
  if (!result.success) return 'E-mail inválido';
  return undefined;
}

export interface UseAppointmentSaveReturn {
  save: (data: AppointmentFormData, appointmentId?: string) => Promise<boolean>;
  isSaving: boolean;
  validate: (data: AppointmentFormData, mode: 'create' | 'edit') => AppointmentFormErrors;
}

export function useAppointmentSave(): UseAppointmentSaveReturn {
  const [isSaving, setIsSaving] = useState(false);

  const validate = useCallback((data: AppointmentFormData, mode: 'create' | 'edit'): AppointmentFormErrors => {
    const errors: AppointmentFormErrors = {};

    if (mode === 'create') {
      Object.assign(errors, validateRequired(data, CREATE_REQUIRED_FIELDS));
    } else {
      // Edit mode: contactName is still required
      Object.assign(errors, validateRequired(data, ['contactName']));
    }

    const emailError = validateEmail(data.contactEmail);
    if (emailError) errors.contactEmail = emailError;

    return errors;
  }, []);

  const save = useCallback(async (data: AppointmentFormData, appointmentId?: string): Promise<boolean> => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    if (appointmentId) {
      const idx = MOCK_APPOINTMENTS.findIndex((a) => a.id === appointmentId);
      if (idx !== -1) {
        MOCK_APPOINTMENTS[idx] = {
          ...MOCK_APPOINTMENTS[idx],
          scheduledDate: data.scheduledDate || MOCK_APPOINTMENTS[idx].scheduledDate,
          timeSlot: data.timeSlot || MOCK_APPOINTMENTS[idx].timeSlot,
          contactName: data.contactName,
          contactPhone: data.contactPhone || null,
          contactEmail: data.contactEmail || null,
          keyRequired: data.keyRequired,
          meetingLocation: data.meetingLocation || null,
          keyLocation: data.keyLocation || null,
          notes: data.notes || null,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      const newAppointment: AppointmentDetail = {
        id: `apt-${Date.now()}`,
        code: `VST-${String(MOCK_APPOINTMENTS.length + 1).padStart(3, '0')}`,
        tenantId: 'tenant-1',
        branchId: data.branchId,
        branchName: data.branchId === 'branch-1' ? 'Filial Centro' : 'Filial Norte',
        propertyId: data.propertyId,
        propertyAddress: data.propertyId,
        serviceTypeId: data.serviceTypeId,
        serviceTypeName: data.serviceTypeId === 'svc-1' ? 'Vistoria de Entrada' : 'Vistoria de Saída',
        status: AppointmentStatus.DRAFT,
        tenantConfirmationStatus: TenantConfirmationStatus.PENDING,
        contactName: data.contactName,
        contactPhone: data.contactPhone || null,
        contactEmail: data.contactEmail || null,
        inspectorId: null,
        inspectorName: null,
        scheduledDate: data.scheduledDate,
        timeSlot: data.timeSlot,
        keyRequired: data.keyRequired,
        notes: data.notes || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        meetingLocation: data.meetingLocation || null,
        keyLocation: data.keyLocation || null,
        cancellationReason: null,
      };
      MOCK_APPOINTMENTS.push(newAppointment);
    }

    setIsSaving(false);
    return true;
  }, []);

  return { save, isSaving, validate };
}
