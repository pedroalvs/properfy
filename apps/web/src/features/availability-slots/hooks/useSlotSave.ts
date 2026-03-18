import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { SlotFormData, SlotFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const REQUIRED_FIELDS: (keyof SlotFormData)[] = [
  'inspectorId',
  'date',
  'startTime',
  'endTime',
  'region',
];

function validateRequired(data: SlotFormData, fields: (keyof SlotFormData)[]): SlotFormErrors {
  const errors: SlotFormErrors = {};
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
}

export interface UseSlotSaveReturn {
  save: (data: SlotFormData, slotId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: SlotFormData) => SlotFormErrors;
}

export function useSlotSave(): UseSlotSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: SlotFormData): SlotFormErrors => {
    const errors = validateRequired(data, REQUIRED_FIELDS);

    if (data.startTime && data.endTime && data.endTime <= data.startTime) {
      errors.endTime = 'End time must be after start time';
    }

    if (data.capacity < 1) {
      errors.capacity = 'Capacity must be at least 1';
    }

    return errors;
  }, []);

  const save = useCallback(async (data: SlotFormData, slotId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      if (slotId) {
        const { error } = await api.PATCH(`/v1/availability-slots/${slotId}` as any, { body: data as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST('/v1/availability-slots' as any, { body: data as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      }
      queryClient.invalidateQueries({ queryKey: ['availability-slots'] });
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
