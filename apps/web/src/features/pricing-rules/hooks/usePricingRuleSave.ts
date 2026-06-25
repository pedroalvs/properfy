import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { PricingRuleFormData, PricingRuleFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const REQUIRED_FIELDS: (keyof PricingRuleFormData)[] = [
  'tenantId',
  'serviceTypeId',
  'priceAmount',
  'payoutType',
  'payoutValue',
];

function validateForm(data: PricingRuleFormData): PricingRuleFormErrors {
  const errors: PricingRuleFormErrors = {};

  for (const field of REQUIRED_FIELDS) {
    const value = data[field];
    if (typeof value === 'string' && !value.trim()) {
      errors[field] = REQUIRED_FIELD_MESSAGE;
    }
  }

  if (data.priceAmount && (isNaN(Number(data.priceAmount)) || Number(data.priceAmount) <= 0)) {
    errors.priceAmount = 'Must be a positive number';
  }

  if (data.payoutValue && (isNaN(Number(data.payoutValue)) || Number(data.payoutValue) <= 0)) {
    errors.payoutValue = 'Must be a positive number';
  }

  return errors;
}

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface UsePricingRuleSaveReturn {
  save: (data: PricingRuleFormData, ruleId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: PricingRuleFormData) => PricingRuleFormErrors;
}

export function usePricingRuleSave(): UsePricingRuleSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: PricingRuleFormData): PricingRuleFormErrors => {
    return validateForm(data);
  }, []);

  const save = useCallback(async (data: PricingRuleFormData, ruleId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      const body = {
        ...(data.tenantId ? { tenantId: data.tenantId } : {}),
        serviceTypeId: data.serviceTypeId,
        ...(data.branchId ? { branchId: data.branchId } : {}),
        priceAmount: Number(data.priceAmount),
        payoutType: data.payoutType,
        payoutValue: Number(data.payoutValue),
        status: data.status,
      };

      if (ruleId) {
        const { error } = await api.PATCH(`/v1/pricing-rules/${ruleId}` as any, { body: body as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST('/v1/pricing-rules' as any, { body: body as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      }
      queryClient.invalidateQueries({ queryKey: ['pricing-rules'] });
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
