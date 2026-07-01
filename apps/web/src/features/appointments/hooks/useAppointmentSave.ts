import { useState, useCallback } from 'react';
import { RestrictionSource, ContactType, createAppointmentSchema, updateAppointmentSchema } from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { AppointmentFormData, AppointmentFormErrors, ContactFormEntry } from '../types';
import { MAX_CUSTOM_FIELDS } from '../types';

/**
 * Build the custom-fields payload from form entries: trim label/value and drop
 * fully-empty rows. Partial rows (only one side filled) are kept so the shared
 * schema / `validate()` surfaces the error rather than silently dropping input.
 */
export function buildCustomFieldsPayload(data: AppointmentFormData): Array<{ label: string; value: string }> {
  return data.customFields
    .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
    .filter((f) => f.label !== '' || f.value !== '');
}

/**
 * Build the contacts array payload from form entries (023 §FR-251..255).
 *
 * For inline-create entries (no `contactId`), the payload now carries the
 * full registry surface — `type`, `company`, `additionalChannels`, `notes` —
 * matching `contactRegistrySchema` in @properfy/shared. The cross-form
 * contract test (T-2-907) asserts the inline shape equals the dedicated
 * `/contacts` create shape modulo `role` (which is appointment-only).
 *
 * The `?? ContactType.RENTAL_TENANT` fallback exists ONLY for backward compatibility
 * with callers that pre-date 023; the standard form path validates that
 * `contactType` is set before submit (`validate()` blocks otherwise).
 */
export function buildContactsPayload(data: AppointmentFormData) {
  if (data.contacts && data.contacts.length > 0) {
    return data.contacts.map((c) => {
      if (c.contactId) {
        return {
          contactId: c.contactId,
          role: c.role,
          isPrimary: c.isPrimary,
        };
      }
      const channels = (c.additionalChannels ?? [])
        .map((ch) => ({
          channel: ch.channel,
          value: ch.value.trim(),
          ...(ch.label && ch.label.trim() ? { label: ch.label.trim() } : {}),
        }))
        .filter((ch) => ch.value.length > 0);
      return {
        inline: {
          type: c.contactType ?? ContactType.RENTAL_TENANT,
          displayName: c.name.trim(),
          ...(c.company && c.company.trim() ? { company: c.company.trim() } : {}),
          ...(c.email.trim() ? { primaryEmail: c.email.trim() } : { primaryEmail: null }),
          ...(c.phone.trim() ? { primaryPhone: c.phone.trim() } : { primaryPhone: null }),
          ...(channels.length > 0 ? { additionalChannels: channels } : {}),
          ...(c.notes && c.notes.trim() ? { notes: c.notes.trim() } : {}),
        },
        role: c.role,
        isPrimary: c.isPrimary,
      };
    });
  }
  return undefined;
}

/** Build legacy contact object from flat fields (backward compat). */
function buildLegacyContact(data: AppointmentFormData) {
  return {
    rentalTenantName: data.contactName.trim(),
    ...(data.contactEmail.trim() ? { primaryEmail: data.contactEmail.trim() } : {}),
    ...(data.contactPhone.trim() ? { primaryPhone: data.contactPhone.trim() } : {}),
  };
}

/** Map flat form fields to the nested shape expected by the shared Zod schema. */
function toSchemaPayload(data: AppointmentFormData, mode: 'create' | 'edit') {
  const contacts = buildContactsPayload(data);
  const contact = buildLegacyContact(data);
  const customFields = buildCustomFieldsPayload(data);
  const actorTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const restriction = data.hasRestriction
    ? {
        isHome: data.restrictionIsHome,
        ...(data.restrictionNotes.trim() ? { notes: data.restrictionNotes.trim() } : {}),
        source: RestrictionSource.OPERATOR,
      }
    : null;

  if (mode === 'create') {
    return {
      branchId: data.branchId || undefined,
      propertyId: data.propertyId || undefined,
      serviceTypeId: data.serviceTypeId || undefined,
      scheduledDate: data.scheduledDate || undefined,
      timeSlotStart: data.timeSlotStart || undefined,
      timeSlotEnd: data.timeSlotEnd || undefined,
      ...(contacts ? { contacts } : { contact }),
      ...(data.appCredentialIds.length > 0 ? { appCredentialIds: data.appCredentialIds } : {}),
      ...(data.hasRestriction ? { restriction } : {}),
      keyRequired: data.keyRequired,
      ...(data.meetingLocation.trim() ? { meetingLocation: data.meetingLocation.trim() } : {}),
      ...(data.keyLocation.trim() ? { keyLocation: data.keyLocation.trim() } : {}),
      ...(data.notes.trim() ? { notes: data.notes.trim() } : {}),
      ...(data.observation.trim() ? { observation: data.observation.trim() } : {}),
      ...(customFields.length > 0 ? { customFields } : {}),
      actorTimezone,
    };
  }

  return {
    ...(data.scheduledDate ? { scheduledDate: data.scheduledDate } : {}),
    ...(data.timeSlotStart && data.timeSlotEnd
      ? { timeSlotStart: data.timeSlotStart, timeSlotEnd: data.timeSlotEnd }
      : {}),
    keyRequired: data.keyRequired,
    meetingLocation: data.meetingLocation.trim() || null,
    keyLocation: data.keyLocation.trim() || null,
    notes: data.notes.trim() || null,
    observation: data.observation.trim() || null,
    ...(contacts ? { contacts } : { contact }),
    // Always send the array on edit so clearing all links persists.
    appCredentialIds: data.appCredentialIds,
    // Always send custom fields on edit so clearing them all persists (the form
    // hydrates them from the appointment, mirroring appCredentialIds).
    customFields,
    ...(data.restrictionTouched ? { restriction } : {}),
    actorTimezone,
  };
}

/** Path-to-field mapping: Zod issue paths use schema field names, but the
 *  form state uses flat field names. */
const SCHEMA_PATH_TO_FORM_FIELD: Record<string, keyof AppointmentFormData> = {
  branchId: 'branchId',
  propertyId: 'propertyId',
  serviceTypeId: 'serviceTypeId',
  scheduledDate: 'scheduledDate',
  timeSlotStart: 'timeSlotStart',
  timeSlotEnd: 'timeSlotEnd',
  'contact.rentalTenantName': 'contactName',
  'contact.primaryEmail': 'contactEmail',
  'contact.primaryPhone': 'contactPhone',
  keyRequired: 'keyRequired',
  meetingLocation: 'meetingLocation',
  keyLocation: 'keyLocation',
  notes: 'notes',
  'restriction.notes': 'restrictionNotes',
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
  errorCode?: string;
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
    // 023 §FR-251 — inline contacts (no `contactId`) MUST carry a `contactType`
    // before submit. Without this guard the registry row would silently land
    // as TENANT regardless of what the user intended (the bug Guia surfaced
    // on the prior round).
    // Only enforce inline contactType in create mode. Edit mode is lenient
    // (the form receives partial data and the existing appointment carries
    // the registry rows already).
    if (mode === 'create' && data.contacts && data.contacts.length > 0) {
      const contactsErrors: Record<number, Partial<Record<keyof ContactFormEntry, string>>> = Object.assign(
        {},
        errors.contacts,
      );
      data.contacts.forEach((c, idx) => {
        if (!c.contactId && !c.contactType) {
          const existing: Partial<Record<keyof ContactFormEntry, string>> = contactsErrors[idx] ?? {};
          contactsErrors[idx] = Object.assign({}, existing, { contactType: 'Contact type is required' });
        }
      });
      if (Object.keys(contactsErrors).length > 0) {
        errors.contacts = contactsErrors;
      }
    }
    // Custom fields: per-row required + length. Fully-empty rows are dropped on
    // save (see buildCustomFieldsPayload), so they are not flagged here. The
    // shared schema's `.max(4)` issue path is unmapped and silently dropped, so
    // the >4 case is guarded explicitly below (the UI also disables "Add" at 4).
    const customFieldsErrors: Record<number, Partial<Record<'label' | 'value', string>>> = {};
    data.customFields.forEach((f, idx) => {
      const label = f.label.trim();
      const value = f.value.trim();
      if (label === '' && value === '') return;
      const rowError: Partial<Record<'label' | 'value', string>> = {};
      if (label === '') rowError.label = 'Label is required';
      else if (label.length > 50) rowError.label = 'Max 50 characters';
      if (value === '') rowError.value = 'Value is required';
      else if (value.length > 500) rowError.value = 'Max 500 characters';
      if (Object.keys(rowError).length > 0) customFieldsErrors[idx] = rowError;
    });
    if (data.customFields.length > MAX_CUSTOM_FIELDS) {
      customFieldsErrors[MAX_CUSTOM_FIELDS] = {
        ...(customFieldsErrors[MAX_CUSTOM_FIELDS] ?? {}),
        label: `Maximum ${MAX_CUSTOM_FIELDS} custom fields allowed`,
      };
    }
    if (Object.keys(customFieldsErrors).length > 0) {
      errors.customFields = customFieldsErrors;
    }
    return errors;
  }, []);

  const save = useCallback(async (data: AppointmentFormData, appointmentId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      if (appointmentId) {
        const payload = toSchemaPayload(data, 'edit');
        const { error } = await api.PATCH(`/v1/appointments/${appointmentId}` as any, { body: payload as any });
        if (error) {
          const apiErr = error as any;
          return { success: false, error: apiErr?.error?.message ?? 'Request failed', errorCode: apiErr?.error?.code };
        }
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        return { success: true, id: appointmentId };
      } else {
        const payload = toSchemaPayload(data, 'create');
        const { data: responseData, error } = await api.POST('/v1/appointments' as any, { body: payload as any });
        if (error) {
          const apiErr = error as any;
          return { success: false, error: apiErr?.error?.message ?? 'Request failed', errorCode: apiErr?.error?.code };
        }
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
