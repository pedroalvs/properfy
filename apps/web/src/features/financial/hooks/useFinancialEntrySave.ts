import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import type { FinancialEntryFormData, FinancialEntryFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

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
  save: (data: FinancialEntryFormData, entryId: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: FinancialEntryFormData) => FinancialEntryFormErrors;
}

/**
 * Edit-only save for an existing financial entry (PATCH /v1/financial/entries/:id).
 *
 * Manual adjustments are CREATED through `CreateAdjustmentModal` (→ `useCreateAdjustment`,
 * POST /v1/financial/entries/adjust, typed), which is the only create entry point in the
 * UI. `FinancialEntryFormDrawer` only ever opens in edit mode, so this hook does not
 * carry a create branch.
 */
export function useFinancialEntrySave(): UseFinancialEntrySaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: FinancialEntryFormData): FinancialEntryFormErrors => {
    return validateRequired(data, EDIT_REQUIRED_FIELDS);
  }, []);

  const save = useCallback(async (data: FinancialEntryFormData, entryId: string): Promise<SaveResult> => {
    if (savingRef.current) return { success: false, error: 'Save already in progress' };
    savingRef.current = true;
    setIsSaving(true);

    try {
      // EDIT → PATCH /v1/financial/entries/{entryId}. The generated contract
      // (updateFinancialEntrySchema) accepts only amount/description/effectiveAt/
      // reason, so the editable fields map cleanly onto the typed body.
      const { error } = await api.PATCH('/v1/financial/entries/{entryId}', {
        params: { path: { entryId } },
        body: {
          amount: Number(data.amount),
          description: data.description,
          effectiveAt: data.effectiveAt ? new Date(data.effectiveAt).toISOString() : undefined,
        },
      });
      if (error) throw toApiError(error);

      await queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      return { success: false, error: message };
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [queryClient]);

  return { save, isSaving, validate };
}
