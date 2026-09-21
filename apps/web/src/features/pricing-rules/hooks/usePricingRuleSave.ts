import { useState, useCallback } from 'react';
import type { PayoutType, PriceRuleStatus } from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/lib/api-error';
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
      // The form's payout type / status are constrained to these unions by their
      // SelectInput options; narrow (not `as any`) so the generated body types apply.
      const payoutType = data.payoutType as PayoutType;
      const status = data.status as PriceRuleStatus;

      if (ruleId) {
        // Update takes only the mutable pricing fields — never tenant/service
        // type/branch (which the old `as any` body wrongly included).
        const { error } = await api.PATCH('/v1/pricing-rules/{pricingRuleId}', {
          params: { path: { pricingRuleId: ruleId } },
          body: {
            priceAmount: Number(data.priceAmount),
            payoutType,
            payoutValue: Number(data.payoutValue),
            status,
          },
        });
        if (error) throw new Error(getErrorMessage(error, 'Request failed'));
      } else {
        const { error } = await api.POST('/v1/pricing-rules', {
          body: {
            ...(data.tenantId ? { tenantId: data.tenantId } : {}),
            serviceTypeId: data.serviceTypeId,
            ...(data.branchId ? { branchId: data.branchId } : {}),
            priceAmount: Number(data.priceAmount),
            payoutType,
            payoutValue: Number(data.payoutValue),
            status,
          },
        });
        if (error) throw new Error(getErrorMessage(error, 'Request failed'));
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
