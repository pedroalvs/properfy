import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  contactSchema,
  createInspectorSchema,
  updateInspectorSchema,
  passwordFieldSchema,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from '@properfy/shared';
import { api } from '@/services/api';
import type { InspectorFormData, InspectorFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const REQUIRED_FIELDS: (keyof InspectorFormData)[] = ['name', 'email'];

/**
 * createInspectorSchema with `password` removed, for the structural parse below.
 * That parse is fed a subset of the form fields and is only read for serviceTypes
 * issues, so a required password would make it fail on every create — harmless
 * today, but it would mask any issue a future path mapping tries to read. The
 * password itself is validated separately in validatePassword.
 */
const createInspectorStructuralSchema = createInspectorSchema.omit({ password: true });

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

function parseServiceTypeEntries(value: string): Array<{ serviceTypeId: string; certified: boolean }> | undefined {
  const parsed = parseDelimitedValues(value);
  if (parsed.length === 0) return undefined;
  return parsed.map((id) => ({ serviceTypeId: id, certified: false }));
}

/** Create-only: the operator sets the inspector's initial login password. */
function validatePassword(data: InspectorFormData, mode: 'create' | 'edit'): InspectorFormErrors {
  const errors: InspectorFormErrors = {};
  if (mode !== 'create') return errors;

  if (!data.password) {
    errors.password = REQUIRED_FIELD_MESSAGE;
  } else if (!passwordFieldSchema.safeParse(data.password).success) {
    errors.password = PASSWORD_REQUIREMENTS_MESSAGE;
  } else if (data.password !== data.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return errors;
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

    Object.assign(errors, validatePassword(data, _mode));

    const serviceTypes = parseServiceTypeEntries(data.serviceTypes);
    const schema = _mode === 'create' ? createInspectorStructuralSchema : updateInspectorSchema;
    const result = schema.safeParse({
      name: data.name.trim() || undefined,
      email: data.email.trim() || undefined,
      phone: data.phone.trim() || undefined,
      status: data.status || undefined,
      regionIds: data.regionIds,
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
      const sharedFields = {
        name: data.name.trim(),
        email: data.email.trim(),
        phone: data.phone.trim() || undefined,
        status: data.status || undefined,
        regionIds: data.regionIds.length > 0 ? data.regionIds : [],
        serviceTypes: parseServiceTypeEntries(data.serviceTypes),
        fullName: data.fullName?.trim() || undefined,
        abn: data.abn?.trim() || undefined,
        dateOfBirth: data.dateOfBirth || undefined,
        insuranceFileKey: data.insuranceFileKey?.trim() || undefined,
        insuranceExpiresAt: data.insuranceExpiresAt || undefined,
        policeCheckFileKey: data.policeCheckFileKey?.trim() || undefined,
        policeCheckExpiresAt: data.policeCheckExpiresAt || undefined,
        blockedClients: data.blockedClients.length > 0 ? data.blockedClients : [],
      };

      let apiError: { error?: { code?: string; message?: string } } | undefined;
      if (inspectorId) {
        // Deliberately excludes `password`: updateInspectorSchema is a plain
        // z.object, so it would be silently stripped server-side — putting a
        // plaintext password on the wire with no error to signal it.
        const { error } = await api.PATCH(`/v1/inspectors/${inspectorId}` as any, { body: sharedFields as any });
        apiError = error as any;
      } else {
        const { error } = await api.POST('/v1/inspectors' as any, {
          body: { ...sharedFields, password: data.password } as any,
        });
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
