import { useState, useCallback } from 'react';
import { createAppointmentSchema, updateAppointmentSchema } from '@properfy/shared';
import type { AppointmentFormData, AppointmentFormErrors } from '../types';
import type { AppointmentDetail } from '../types';
import { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import { MOCK_APPOINTMENTS } from '../mocks/appointments';

const FIELD_LABELS: Record<string, keyof AppointmentFormData> = {
  branchId: 'branchId',
  propertyId: 'propertyId',
  serviceTypeId: 'serviceTypeId',
  scheduledDate: 'scheduledDate',
  timeSlot: 'timeSlot',
  'contact.tenantName': 'contactName',
  'contact.primaryPhone': 'contactPhone',
  'contact.primaryEmail': 'contactEmail',
  keyRequired: 'keyRequired',
  meetingLocation: 'meetingLocation',
  keyLocation: 'keyLocation',
  notes: 'notes',
};

const REQUIRED_FIELD_MESSAGE = 'Campo obrigatório';

function buildCreatePayload(data: AppointmentFormData) {
  return {
    branchId: data.branchId,
    propertyId: data.propertyId || undefined,
    serviceTypeId: data.serviceTypeId,
    scheduledDate: data.scheduledDate,
    timeSlot: data.timeSlot,
    contact: {
      tenantName: data.contactName,
      primaryEmail: data.contactEmail || undefined,
      primaryPhone: data.contactPhone || undefined,
    },
    keyRequired: data.keyRequired,
    meetingLocation: data.meetingLocation || undefined,
    keyLocation: data.keyLocation || undefined,
    notes: data.notes || undefined,
  };
}

function buildUpdatePayload(data: AppointmentFormData) {
  return {
    scheduledDate: data.scheduledDate || undefined,
    timeSlot: data.timeSlot || undefined,
    contact: {
      tenantName: data.contactName,
      primaryEmail: data.contactEmail || undefined,
      primaryPhone: data.contactPhone || undefined,
    },
    keyRequired: data.keyRequired,
    meetingLocation: data.meetingLocation || undefined,
    keyLocation: data.keyLocation || undefined,
    notes: data.notes || undefined,
  };
}

function mapZodErrors(issues: Array<{ path: (string | number)[]; message: string }>): AppointmentFormErrors {
  const errors: AppointmentFormErrors = {};
  for (const issue of issues) {
    const path = issue.path.join('.');
    const field = FIELD_LABELS[path];
    if (field && !errors[field]) {
      errors[field] = issue.message === 'Required' || issue.message === 'String must contain at least 1 character(s)'
        ? REQUIRED_FIELD_MESSAGE
        : issue.message;
    }
  }
  return errors;
}

export interface UseAppointmentSaveReturn {
  save: (data: AppointmentFormData, appointmentId?: string) => Promise<boolean>;
  isSaving: boolean;
  validate: (data: AppointmentFormData, mode: 'create' | 'edit') => AppointmentFormErrors;
}

export function useAppointmentSave(): UseAppointmentSaveReturn {
  const [isSaving, setIsSaving] = useState(false);

  const validate = useCallback((data: AppointmentFormData, mode: 'create' | 'edit'): AppointmentFormErrors => {
    if (mode === 'create') {
      const payload = buildCreatePayload(data);
      const result = createAppointmentSchema.safeParse(payload);
      if (result.success) return {};
      return mapZodErrors(result.error.issues);
    } else {
      const payload = buildUpdatePayload(data);
      const result = updateAppointmentSchema.safeParse(payload);
      if (result.success) return {};
      return mapZodErrors(result.error.issues);
    }
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
