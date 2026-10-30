import { useState, useCallback } from 'react';
import { appointmentCodePrefixSchema, tenantSettingsSchema } from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { identityFieldMapper, mapServerFieldErrors } from '@/lib/server-field-errors';
import type { TenantAdminFormData, TenantAdminFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';
const PREFIX_FORMAT_MESSAGE = 'Use 3–4 letters or numbers';
const PREFIX_CONFLICT_MESSAGE = 'This prefix is already in use by another agency';
const MAP_WINDOW_RANGE_MESSAGE = 'Enter a whole number between 1 and 90.';

const REQUIRED_FIELDS: (keyof TenantAdminFormData)[] = [
  'name',
  'legalName',
  'timezone',
  'currency',
];

const identityMapper = identityFieldMapper<keyof TenantAdminFormData>([
  'name',
  'legalName',
  'timezone',
  'currency',
  'appointmentCodePrefix',
]);

/**
 * Backend VALIDATION_ERROR detail paths: scalar fields map 1:1; settings flags
 * are nested under `settings` in the payload but flat in the form state.
 */
function serverFieldMapper(path: string): keyof TenantAdminFormData | undefined {
  if (path === 'settings.rentalTenantNotificationsEnabled') return 'rentalTenantNotificationsEnabled';
  if (path === 'settings.mapWindowDays') return 'mapWindowDays';
  return identityMapper(path);
}

export interface ValidateOptions {
  /** Prefix is required on create; on edit it may be blank for legacy tenants
   *  pending backfill (so unrelated edits aren't blocked). */
  isCreate?: boolean;
  /** Validate the map window field (shown in edit mode to AM and OP). */
  validateMapWindow?: boolean;
  /** OP edit: the map window is the only editable agency setting, so skip the
   *  general required-field checks (which would wrongly block a map-only save). */
  mapWindowOnly?: boolean;
}

export interface SaveOptions {
  /** `'include'` adds `settings.mapWindowDays` to a full save (AM edit); `'only'`
   *  sends a map-only patch (OP, whose sole editable agency setting is the window). */
  mapWindow?: 'include' | 'only';
}

function validateRequired(data: TenantAdminFormData, fields: (keyof TenantAdminFormData)[]): TenantAdminFormErrors {
  const errors: TenantAdminFormErrors = {};
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && !value.trim()) {
      errors[field] = REQUIRED_FIELD_MESSAGE;
    }
  }
  return errors;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  /** Field-level errors (e.g. a 409 prefix conflict) to render inline. */
  fieldErrors?: TenantAdminFormErrors;
}

export interface UseTenantAdminSaveReturn {
  save: (data: TenantAdminFormData, tenantId?: string, opts?: SaveOptions) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: TenantAdminFormData, opts?: ValidateOptions) => TenantAdminFormErrors;
}

export function useTenantAdminSave(): UseTenantAdminSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: TenantAdminFormData, opts?: ValidateOptions): TenantAdminFormErrors => {
    const isCreate = opts?.isCreate ?? true;
    // OP edits only the map window; its general fields are never rendered, so do
    // not run the general required checks (they would block a valid map-only save).
    const errors: TenantAdminFormErrors = opts?.mapWindowOnly ? {} : validateRequired(data, REQUIRED_FIELDS);

    if (!opts?.mapWindowOnly) {
      const prefix = data.appointmentCodePrefix.trim();
      if (!prefix) {
        // Required on create; allowed empty on edit (legacy tenants).
        if (isCreate) errors.appointmentCodePrefix = REQUIRED_FIELD_MESSAGE;
      } else if (!appointmentCodePrefixSchema.safeParse(prefix).success) {
        // Reuse the shared schema (trim/format) instead of re-encoding the rule.
        errors.appointmentCodePrefix = PREFIX_FORMAT_MESSAGE;
      }
    }

    if (opts?.validateMapWindow || opts?.mapWindowOnly) {
      // Reuse the shared schema (integer 1–90) as the single source of truth;
      // an empty field or a non-integer/out-of-range value is rejected inline.
      const raw = data.mapWindowDays.trim();
      if (!raw || !tenantSettingsSchema.shape.mapWindowDays.safeParse(Number(raw)).success) {
        errors.mapWindowDays = MAP_WINDOW_RANGE_MESSAGE;
      }
    }
    return errors;
  }, []);

  const save = useCallback(async (data: TenantAdminFormData, tenantId?: string, opts?: SaveOptions): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      let error: unknown;
      if (opts?.mapWindow === 'only') {
        // OP map-only patch: the window is the single agency setting OP may change,
        // so the body carries nothing else.
        ({ error } = await api.PATCH('/v1/tenants/{tenantId}', {
          params: { path: { tenantId: tenantId! } },
          body: { settings: { mapWindowDays: Number(data.mapWindowDays) } },
        }));
      } else {
        // Settings flags are nested under `settings` (deep-merged server-side into
        // settings_json); scalar fields stay top-level. `notes` is not part of the
        // API contract and is excluded from the payload, as is the map window
        // unless `mapWindow === 'include'` (AM edit).
        const { rentalTenantNotificationsEnabled, appointmentCodePrefix, notes: _notes, mapWindowDays: _mapWindowDays, ...rest } = data;
        // Only send the prefix when present (uppercased to match the backend). On
        // edit, an empty value (legacy tenant) is omitted so the field is untouched.
        const trimmedPrefix = appointmentCodePrefix.trim().toUpperCase();
        const settings: {
          rentalTenantNotificationsEnabled: boolean;
          emailSendingEnabled: boolean;
          mapWindowDays?: number;
        } = {
          rentalTenantNotificationsEnabled,
          emailSendingEnabled: rentalTenantNotificationsEnabled,
        };
        if (opts?.mapWindow === 'include') {
          settings.mapWindowDays = Number(data.mapWindowDays);
        }

        ({ error } = tenantId
          ? await api.PATCH('/v1/tenants/{tenantId}', {
              params: { path: { tenantId } },
              body: { ...rest, settings, ...(trimmedPrefix ? { appointmentCodePrefix: trimmedPrefix } : {}) },
            })
          : await api.POST('/v1/tenants', {
              body: { ...rest, settings, appointmentCodePrefix: trimmedPrefix },
            }));
      }

      type ApiErrorEnvelope = { error?: { code?: string; message?: string } };
      const errorEnvelope = error as ApiErrorEnvelope | undefined;
      if (error) {
        // Surface the prefix-uniqueness conflict inline rather than as a generic snackbar.
        if (errorEnvelope?.error?.code === 'TENANT_PREFIX_CONFLICT') {
          return { success: false, fieldErrors: { appointmentCodePrefix: PREFIX_CONFLICT_MESSAGE } };
        }
        // Map VALIDATION_ERROR details to inline field errors; unmatched
        // details (or non-validation errors) fall back to the summary error.
        return { success: false, ...mapServerFieldErrors(error, serverFieldMapper, 'Request failed') };
      }
      queryClient.invalidateQueries({ queryKey: ['tenant-admins'] });
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
