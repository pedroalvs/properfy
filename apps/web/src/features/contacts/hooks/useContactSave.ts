import { useState, useCallback } from 'react';
import {
  contactRegistrySchema,
  contactRegistryUpdateSchema,
  type ContactChannelType,
} from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import type { ContactFormData, ContactFormErrors } from '../types';

function trimToNullableString(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

function trimToOptionalString(v: string): string | undefined {
  const t = v.trim();
  return t === '' ? undefined : t;
}

function buildAdditionalChannels(channels: ContactFormData['additionalChannels']) {
  return channels
    .filter((c) => c.channel && c.value.trim() !== '')
    .map((c) => ({
      channel: c.channel as ContactChannelType,
      value: c.value.trim(),
      ...(c.label.trim() ? { label: c.label.trim() } : {}),
    }));
}

function toCreatePayload(data: ContactFormData, tenantId?: string | null) {
  return {
    type: data.type || undefined,
    displayName: trimToOptionalString(data.displayName),
    company: trimToOptionalString(data.company),
    primaryEmail: trimToOptionalString(data.primaryEmail),
    primaryPhone: trimToOptionalString(data.primaryPhone),
    additionalChannels: buildAdditionalChannels(data.additionalChannels),
    notes: trimToOptionalString(data.notes),
    ...(tenantId ? { tenantId } : {}),
  };
}

function toUpdatePayload(data: ContactFormData) {
  return {
    type: data.type || undefined,
    displayName: trimToOptionalString(data.displayName),
    company: trimToNullableString(data.company),
    primaryEmail: trimToNullableString(data.primaryEmail),
    primaryPhone: trimToNullableString(data.primaryPhone),
    additionalChannels: buildAdditionalChannels(data.additionalChannels),
    notes: trimToNullableString(data.notes),
  };
}

function isRequiredError(issue: { code?: string; message: string }): boolean {
  return issue.code === 'invalid_type' || issue.message === 'Required';
}

function zodErrorsToFormErrors(issues: { path: (string | number)[]; message: string; code?: string }[]): ContactFormErrors {
  const errors: ContactFormErrors = {};
  for (const issue of issues) {
    const top = issue.path[0];
    const key = (typeof top === 'string' ? top : 'additionalChannels') as keyof ContactFormErrors;
    if (key && !errors[key]) {
      errors[key] = isRequiredError(issue) ? 'Required field' : issue.message;
    }
  }
  return errors;
}

export interface SaveResult {
  success: boolean;
  /** API error code, e.g. CONTACT_EMAIL_EXISTS / CONTACT_PHONE_EXISTS / VALIDATION_ERROR. */
  errorCode?: string;
  errorMessage?: string;
  id?: string;
}

export interface UseContactSaveReturn {
  save: (data: ContactFormData, contactId?: string, tenantIdOverride?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: ContactFormData, mode: 'create' | 'edit') => ContactFormErrors;
}

export function useContactSave(): UseContactSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const validate = useCallback((data: ContactFormData, mode: 'create' | 'edit'): ContactFormErrors => {
    const payload = mode === 'create' ? toCreatePayload(data) : toUpdatePayload(data);
    const schema = mode === 'create' ? contactRegistrySchema : contactRegistryUpdateSchema;
    const result = schema.safeParse(payload);
    const errors: ContactFormErrors = {};
    if (!result.success) {
      Object.assign(errors, zodErrorsToFormErrors(result.error.issues));
    }
    return errors;
  }, []);

  const save = useCallback(async (
    data: ContactFormData,
    contactId?: string,
    tenantIdOverride?: string,
  ): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      let newId: string | undefined;
      if (contactId) {
        const payload = toUpdatePayload(data);
        const { error } = await api.PATCH(`/v1/contacts/${contactId}` as any, { body: payload as any });
        if (error) {
          return {
            success: false,
            errorCode: (error as any)?.error?.code ?? 'UNKNOWN_ERROR',
            errorMessage: (error as any)?.error?.message ?? 'Request failed',
          };
        }
      } else {
        const payload = toCreatePayload(data, tenantIdOverride ?? user?.tenantId);
        const { data: responseData, error } = await api.POST('/v1/contacts' as any, { body: payload as any });
        if (error) {
          return {
            success: false,
            errorCode: (error as any)?.error?.code ?? 'UNKNOWN_ERROR',
            errorMessage: (error as any)?.error?.message ?? 'Request failed',
          };
        }
        newId = (responseData as any)?.data?.id;
      }
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      return { success: true, id: newId };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient, user?.tenantId]);

  return { save, isSaving, validate };
}
