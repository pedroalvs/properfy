import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { FinancialEntryFormData, FinancialEntryFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const CREATE_REQUIRED_FIELDS: (keyof FinancialEntryFormData)[] = [
  'entryType', 'amount', 'description', 'relatedEntityName', 'effectiveAt',
];

const EDIT_REQUIRED_FIELDS: (keyof FinancialEntryFormData)[] = [
  'amount', 'description', 'relatedEntityName', 'effectiveAt',
];

function validateRequired(data: FinancialEntryFormData, fields: (keyof FinancialEntryFormData)[]): FinancialEntryFormErrors {
  const errors: FinancialEntryFormErrors = {};
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

export interface UseFinancialEntrySaveReturn {
  save: (data: FinancialEntryFormData, entryId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: FinancialEntryFormData, mode: 'create' | 'edit') => FinancialEntryFormErrors;
}

export function useFinancialEntrySave(): UseFinancialEntrySaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: FinancialEntryFormData, mode: 'create' | 'edit'): FinancialEntryFormErrors => {
    const fields = mode === 'create' ? CREATE_REQUIRED_FIELDS : EDIT_REQUIRED_FIELDS;
    return validateRequired(data, fields);
  }, []);

  const save = useCallback(async (data: FinancialEntryFormData, entryId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      const payload = {
        entryType: data.entryType || undefined,
        amount: Number(data.amount),
        description: data.description,
        relatedEntityName: data.relatedEntityName,
        effectiveAt: data.effectiveAt ? new Date(data.effectiveAt).toISOString() : undefined,
        referenceNumber: data.referenceNumber || undefined,
        notes: data.notes || undefined,
      };

      if (entryId) {
        const { error } = await api.PATCH(`/v1/financial/entries/${entryId}` as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST('/v1/financial/entries/adjust' as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      }

      await queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
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
