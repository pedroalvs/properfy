import { useState, useCallback } from 'react';
import { FinancialEntryStatus } from '@properfy/shared';
import type { FinancialEntryType } from '@properfy/shared';
import type { FinancialEntryFormData, FinancialEntryFormErrors } from '../types';
import { MOCK_FINANCIAL_ENTRIES } from '../mocks/financialEntries';

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

export interface UseFinancialEntrySaveReturn {
  save: (data: FinancialEntryFormData, entryId?: string) => Promise<boolean>;
  isSaving: boolean;
  validate: (data: FinancialEntryFormData, mode: 'create' | 'edit') => FinancialEntryFormErrors;
}

export function useFinancialEntrySave(): UseFinancialEntrySaveReturn {
  const [isSaving, setIsSaving] = useState(false);

  const validate = useCallback((data: FinancialEntryFormData, mode: 'create' | 'edit'): FinancialEntryFormErrors => {
    const fields = mode === 'create' ? CREATE_REQUIRED_FIELDS : EDIT_REQUIRED_FIELDS;
    return validateRequired(data, fields);
  }, []);

  const save = useCallback(async (data: FinancialEntryFormData, entryId?: string): Promise<boolean> => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    if (entryId) {
      const idx = MOCK_FINANCIAL_ENTRIES.findIndex((e) => e.id === entryId);
      if (idx !== -1) {
        const existing = MOCK_FINANCIAL_ENTRIES[idx]!;
        MOCK_FINANCIAL_ENTRIES[idx] = {
          ...existing,
          amount: Number(data.amount),
          description: data.description,
          relatedEntityName: data.relatedEntityName,
          effectiveAt: new Date(data.effectiveAt).toISOString(),
          referenceNumber: data.referenceNumber || null,
          notes: data.notes || null,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      MOCK_FINANCIAL_ENTRIES.push({
        id: `fin-${Date.now()}`,
        tenantId: 't-1',
        appointmentCode: '',
        entryType: data.entryType as FinancialEntryType,
        amount: Number(data.amount),
        currency: 'BRL',
        status: FinancialEntryStatus.PENDING,
        description: data.description,
        relatedEntityName: data.relatedEntityName,
        effectiveAt: new Date(data.effectiveAt).toISOString(),
        approvedByName: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: data.notes || null,
        approvedAt: null,
        referenceNumber: data.referenceNumber || null,
      });
    }

    setIsSaving(false);
    return true;
  }, []);

  return { save, isSaving, validate };
}
