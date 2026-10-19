import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
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
  resetIdempotencyKey: () => void;
}

export function useFinancialEntrySave(): UseFinancialEntrySaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const queryClient = useQueryClient();

  const validate = useCallback((data: FinancialEntryFormData, mode: 'create' | 'edit'): FinancialEntryFormErrors => {
    const fields = mode === 'create' ? CREATE_REQUIRED_FIELDS : EDIT_REQUIRED_FIELDS;
    return validateRequired(data, fields);
  }, []);

  const save = useCallback(async (data: FinancialEntryFormData, entryId?: string): Promise<SaveResult> => {
    if (savingRef.current) return { success: false, error: 'Save already in progress' };
    savingRef.current = true;
    setIsSaving(true);

    try {
      if (entryId) {
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
      } else {
        // CREATE → POST /v1/financial/entries/adjust. The generated contract
        // (createManualAdjustmentSchema) REQUIRES tenantId + reason and rejects
        // entryType/relatedEntityName/referenceNumber/notes. FinancialEntryFormData
        // supplies none of those, so the adjust body cannot yet be typed against
        // the contract — the form must first gain tenantId + reason. The single
        // remaining `any` below marks that create-side gap (tracked for WEB-6).
        const payload = {
          entryType: data.entryType || undefined,
          amount: Number(data.amount),
          description: data.description,
          relatedEntityName: data.relatedEntityName,
          effectiveAt: data.effectiveAt ? new Date(data.effectiveAt).toISOString() : undefined,
          referenceNumber: data.referenceNumber || undefined,
          notes: data.notes || undefined,
        };
        const { error } = await api.POST('/v1/financial/entries/adjust', {
          body: payload as any,
          headers: { 'Idempotency-Key': idempotencyKeyRef.current },
        });
        if (error) throw toApiError(error);
      }

      idempotencyKeyRef.current = crypto.randomUUID();
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

  const resetIdempotencyKey = useCallback(() => {
    idempotencyKeyRef.current = crypto.randomUUID();
  }, []);

  return { save, isSaving, validate, resetIdempotencyKey };
}
