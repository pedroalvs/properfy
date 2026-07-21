import { useState, useCallback } from 'react';
import {
  contactRegistrySchema,
  contactRegistryUpdateSchema,
  getErrorMessage,
  getFieldErrors,
  type ContactChannelType,
} from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { identityFieldMapper } from '@/lib/server-field-errors';
import type { ContactFormData, ContactFormErrors } from '../types';

/** Backend VALIDATION_ERROR detail paths that mirror the flat registry schema. */
const flatFieldMapper = identityFieldMapper<keyof ContactFormData>([
  'type',
  'displayName',
  'company',
  'primaryEmail',
  'primaryPhone',
  'notes',
]);

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

/**
 * Exported for the cross-form contract test (T-2-907) — asserts the inline
 * appointment-create payload has a structurally equivalent registry sub-shape.
 *
 * Shape pinning:
 *   - `primaryEmail` / `primaryPhone` are always emitted as `string | null`
 *     (mirrors the inline appointment-form payload, both accepted by the
 *     registry Zod schema).
 *   - `company` / `additionalChannels` / `notes` are omitted entirely when
 *     empty so dedicated and inline payloads agree on key presence.
 */
export function toCreatePayload(data: ContactFormData, tenantId?: string | null) {
  const channels = buildAdditionalChannels(data.additionalChannels);
  const company = trimToOptionalString(data.company);
  const notes = trimToOptionalString(data.notes);
  return {
    type: data.type || undefined,
    displayName: trimToOptionalString(data.displayName),
    ...(company !== undefined ? { company } : {}),
    primaryEmail: trimToNullableString(data.primaryEmail),
    primaryPhone: trimToNullableString(data.primaryPhone),
    ...(channels.length > 0 ? { additionalChannels: channels } : {}),
    ...(notes !== undefined ? { notes } : {}),
    // 024 §FR-308 — `null` is a valid value (Standalone path); only
    // omit when caller passed `undefined` (= no opinion, fall back to JWT).
    ...(tenantId !== undefined ? { tenantId } : {}),
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
    // Per-row channel errors: path ['additionalChannels', index, 'value'|...]
    if (top === 'additionalChannels' && typeof issue.path[1] === 'number') {
      const index = issue.path[1];
      const rowErrors = errors.additionalChannelErrors ?? {};
      if (!rowErrors[index]) {
        rowErrors[index] = isRequiredError(issue) ? 'Required field' : issue.message;
        errors.additionalChannelErrors = rowErrors;
      }
      continue;
    }
    const key = (typeof top === 'string' ? top : 'additionalChannels') as keyof Omit<ContactFormErrors, 'additionalChannelErrors'>;
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
  /** Backend VALIDATION_ERROR details mapped to form fields (inline display). */
  fieldErrors?: ContactFormErrors;
  id?: string;
}

/**
 * Normalize an API error into the contact SaveResult failure shape.
 *
 * Flat detail paths map 1:1 to form fields. Per-row `additionalChannels.N.*`
 * paths are remapped from payload index to form row index (the payload builder
 * drops rows without a channel/value, see `buildAdditionalChannels`); an index
 * that no longer maps to a form row falls back to the summary snackbar.
 */
function toFailureResult(error: unknown, data: ContactFormData): SaveResult {
  const apiErr = error as { error?: { code?: string } };
  const details = getFieldErrors(error);
  const channelFormIndexes = data.additionalChannels
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.channel && c.value.trim() !== '')
    .map(({ i }) => i);
  const fieldErrors: ContactFormErrors = {};
  let unmatched = false;
  for (const [path, message] of Object.entries(details)) {
    const flat = flatFieldMapper(path);
    if (flat !== undefined) {
      if (fieldErrors[flat] === undefined) fieldErrors[flat] = message;
      continue;
    }
    const channelMatch = /^additionalChannels\.(\d+)\./.exec(path);
    if (channelMatch) {
      const formIndex = channelFormIndexes[Number(channelMatch[1])];
      if (formIndex !== undefined) {
        const rowErrors = fieldErrors.additionalChannelErrors ?? {};
        if (rowErrors[formIndex] === undefined) rowErrors[formIndex] = message;
        fieldErrors.additionalChannelErrors = rowErrors;
        continue;
      }
    }
    unmatched = true;
  }
  const matched = Object.keys(fieldErrors).length > 0;
  return {
    success: false,
    errorCode: apiErr?.error?.code ?? 'UNKNOWN_ERROR',
    ...(matched ? { fieldErrors } : {}),
    ...(!matched || unmatched
      ? { errorMessage: getErrorMessage(error, 'Request failed') }
      : {}),
  };
}

export interface UseContactSaveReturn {
  /**
   * 024 §FR-301/308 — `tenantIdOverride` accepts `null` to create a
   * standalone contact (posts `tenantId: null`), a tenant id to pin, or
   * `undefined` to fall back to the actor's JWT tenant.
   */
  save: (data: ContactFormData, contactId?: string, tenantIdOverride?: string | null) => Promise<SaveResult>;
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
      // buildAdditionalChannels drops empty rows before parsing, so zod issue
      // indexes refer to the filtered payload — remap them to form row indexes.
      if (errors.additionalChannelErrors) {
        const formIndexes = data.additionalChannels
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => c.channel && c.value.trim() !== '')
          .map(({ i }) => i);
        const remapped: Record<number, string> = {};
        for (const [payloadIndex, message] of Object.entries(errors.additionalChannelErrors)) {
          const formIndex = formIndexes[Number(payloadIndex)];
          if (formIndex !== undefined) remapped[formIndex] = message;
        }
        errors.additionalChannelErrors = remapped;
      }
    }
    return errors;
  }, []);

  const save = useCallback(async (
    data: ContactFormData,
    contactId?: string,
    tenantIdOverride?: string | null,
  ): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      let newId: string | undefined;
      if (contactId) {
        const payload = toUpdatePayload(data);
        const { error } = await api.PATCH(`/v1/contacts/${contactId}` as any, { body: payload as any });
        if (error) return toFailureResult(error, data);
      } else {
        // 024 §FR-308 — distinguish "AM/OP picked Standalone" (override === null,
        // post tenantId: null) from "fall back to JWT" (override === undefined).
        // CL roles always fall back to JWT — they can't reach the Standalone path.
        const resolvedTenantId = tenantIdOverride !== undefined ? tenantIdOverride : (user?.tenantId ?? null);
        const payload = toCreatePayload(data, resolvedTenantId);
        const { data: responseData, error } = await api.POST('/v1/contacts' as any, { body: payload as any });
        if (error) return toFailureResult(error, data);
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
