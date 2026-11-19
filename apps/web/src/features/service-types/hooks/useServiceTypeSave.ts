import { useState, useCallback } from 'react';
import {
  SERVICE_TYPE_DURATION_MIN_MINUTES,
  SERVICE_TYPE_DURATION_MAX_MINUTES,
  type ServiceTypeFlowType,
} from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { getErrorMessage, getFieldErrors } from '@/lib/api-error';
import type { ServiceTypeFormData, ServiceTypeFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';
const DURATION_REQUIRED_MESSAGE = 'Enter the duration in minutes';
const DURATION_WHOLE_MESSAGE = 'Enter whole minutes';
const DURATION_RANGE_MESSAGE = `Enter a duration between ${SERVICE_TYPE_DURATION_MIN_MINUTES} and ${SERVICE_TYPE_DURATION_MAX_MINUTES} minutes`;

const REQUIRED_FIELDS: (keyof ServiceTypeFormData)[] = [
  'code',
  'name',
  'flowType',
];

/** Validate the duration input string (5..480, whole minutes). */
function validateDuration(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return DURATION_REQUIRED_MESSAGE;
  if (!/^-?\d+$/.test(trimmed)) return DURATION_WHOLE_MESSAGE;
  const value = Number(trimmed);
  if (value < SERVICE_TYPE_DURATION_MIN_MINUTES || value > SERVICE_TYPE_DURATION_MAX_MINUTES) {
    return DURATION_RANGE_MESSAGE;
  }
  return undefined;
}

function validateRequired(data: ServiceTypeFormData, fields: (keyof ServiceTypeFormData)[]): ServiceTypeFormErrors {
  const errors: ServiceTypeFormErrors = {};
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && !value.trim()) {
      errors[field] = REQUIRED_FIELD_MESSAGE;
    }
  }
  const durationError = validateDuration(data.defaultDurationMinutes);
  if (durationError) errors.defaultDurationMinutes = durationError;
  return errors;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  /** Per-field messages mapped from a server validation error (e.g. duration). */
  fieldErrors?: ServiceTypeFormErrors;
}

export interface UseServiceTypeSaveReturn {
  save: (data: ServiceTypeFormData, serviceTypeId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: ServiceTypeFormData) => ServiceTypeFormErrors;
}

export function useServiceTypeSave(): UseServiceTypeSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: ServiceTypeFormData): ServiceTypeFormErrors => {
    return validateRequired(data, REQUIRED_FIELDS);
  }, []);

  const save = useCallback(async (data: ServiceTypeFormData, serviceTypeId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      // Constrained to the enum by the form's SelectInput options — narrow, not `as any`.
      const flowType = data.flowType as ServiceTypeFlowType;
      const defaultDurationMinutes = Number(data.defaultDurationMinutes);
      if (serviceTypeId) {
        // Update never carries `code` (immutable); the old `as any` body wrongly sent it.
        const { error } = await api.PATCH('/v1/service-types/{serviceTypeId}', {
          params: { path: { serviceTypeId } },
          body: {
            name: data.name,
            flowType,
            requiresRentalTenantConfirmation: data.requiresRentalTenantConfirmation,
            defaultDurationMinutes,
          },
        });
        if (error) throw error;
      } else {
        const { error } = await api.POST('/v1/service-types', {
          body: {
            code: data.code,
            name: data.name,
            flowType,
            requiresRentalTenantConfirmation: data.requiresRentalTenantConfirmation,
            defaultDurationMinutes,
          },
        });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      return { success: true };
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to save');
      const serverFields = getFieldErrors(err);
      const fieldErrors = Object.keys(serverFields).length > 0 ? (serverFields as ServiceTypeFormErrors) : undefined;
      return { success: false, error: message, fieldErrors };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient]);

  return { save, isSaving, validate };
}
