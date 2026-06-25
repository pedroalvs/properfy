import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { BranchFormData, BranchFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const REQUIRED_FIELDS: (keyof BranchFormData)[] = ['name'];

function validateRequired(data: BranchFormData, fields: (keyof BranchFormData)[]): BranchFormErrors {
  const errors: BranchFormErrors = {};
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && !value.trim()) {
      errors[field] = REQUIRED_FIELD_MESSAGE;
    }
  }
  return errors;
}

function validateEmail(email: string): string | undefined {
  if (!email) return undefined;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return 'Invalid email';
  return undefined;
}

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface UseBranchSaveReturn {
  save: (data: BranchFormData, tenantId: string, branchId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: BranchFormData) => BranchFormErrors;
}

export function useBranchSave(): UseBranchSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: BranchFormData): BranchFormErrors => {
    const errors: BranchFormErrors = {};
    Object.assign(errors, validateRequired(data, REQUIRED_FIELDS));

    const emailError = validateEmail(data.contactEmail);
    if (emailError) errors.contactEmail = emailError;

    return errors;
  }, []);

  const save = useCallback(async (data: BranchFormData, tenantId: string, branchId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      const payload = {
        name: data.name,
        address: data.address
          ? {
              street: data.address.street,
              suburb: data.address.suburb,
              city: data.address.suburb, // AU addresses have no separate city; suburb is the locality
              state: data.address.state,
              postcode: data.address.postcode,
              country: data.address.country || 'AU',
              latitude: data.address.latitude || undefined,
              longitude: data.address.longitude || undefined,
            }
          : undefined,
        contactEmail: data.contactEmail || undefined,
      };
      if (branchId) {
        const { error } = await api.PATCH(`/v1/tenants/${tenantId}/branches/${branchId}` as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST(`/v1/tenants/${tenantId}/branches` as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      }
      queryClient.invalidateQueries({ queryKey: ['tenant-admins', tenantId, 'branches'] });
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
