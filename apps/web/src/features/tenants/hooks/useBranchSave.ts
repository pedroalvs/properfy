import { useState, useCallback } from 'react';
import {
  getErrorMessage,
  ADDRESS_NOT_VERIFIED_CODE,
  ADDRESS_NOT_VERIFIED_REASONS,
  type AddressNotVerifiedReason,
} from '@properfy/shared';
import { api } from '@/services/api';
import { isValidEmail } from '@/lib/validation';
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
  if (!isValidEmail(email)) return 'Invalid email';
  return undefined;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  /** 422 ADDRESS_NOT_VERIFIED (V-2): the reason, so the drawer shows the copy + marks the fields. */
  addressNotVerified?: AddressNotVerifiedReason;
}

/** Read a 422 ADDRESS_NOT_VERIFIED reason off the error envelope, if present. */
function readAddressNotVerified(error: unknown): AddressNotVerifiedReason | undefined {
  const envelope = (error as { error?: { code?: string; details?: unknown } } | undefined)?.error;
  if (envelope?.code !== ADDRESS_NOT_VERIFIED_CODE) return undefined;
  const details = Array.isArray(envelope.details) ? envelope.details : [];
  const reason = (details[0] as { reason?: string } | undefined)?.reason;
  return ADDRESS_NOT_VERIFIED_REASONS.includes(reason as AddressNotVerifiedReason)
    ? (reason as AddressNotVerifiedReason)
    : undefined;
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
              // Preserve an imported/API house number so an edit doesn't wipe it (O-2).
              ...(data.address.number ? { number: data.address.number } : {}),
              suburb: data.address.suburb,
              city: data.address.suburb, // AU addresses have no separate city; suburb is the locality
              state: data.address.state,
              postcode: data.address.postcode,
              country: data.address.country || 'AU',
              // latitude/longitude are intentionally NOT sent: branch coordinates
              // come only from permanent-mode geocoding on the backend (X02-1).
            }
          : undefined,
        contactEmail: data.contactEmail || undefined,
      };
      if (branchId) {
        const { error } = await api.PATCH('/v1/tenants/{tenantId}/branches/{branchId}', {
          params: { path: { tenantId, branchId } },
          body: payload,
        });
        if (error) {
          const addressNotVerified = readAddressNotVerified(error);
          if (addressNotVerified) return { success: false, addressNotVerified };
          throw new Error(getErrorMessage(error, 'Request failed'));
        }
      } else {
        const { error } = await api.POST('/v1/tenants/{tenantId}/branches', {
          params: { path: { tenantId } },
          body: payload,
        });
        if (error) {
          const addressNotVerified = readAddressNotVerified(error);
          if (addressNotVerified) return { success: false, addressNotVerified };
          throw new Error(getErrorMessage(error, 'Request failed'));
        }
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
