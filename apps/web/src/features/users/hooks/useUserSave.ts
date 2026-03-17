import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { contactSchema } from '@properfy/shared';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { UserFormData, UserFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const REQUIRED_FIELDS: (keyof UserFormData)[] = ['name', 'email', 'role'];

function validateRequired(data: UserFormData, fields: (keyof UserFormData)[]): UserFormErrors {
  const errors: UserFormErrors = {};
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
  const result = contactSchema.shape.primaryEmail.safeParse(email);
  if (!result.success) return 'Invalid email';
  return undefined;
}

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface UseUserSaveReturn {
  save: (data: UserFormData, userId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: UserFormData, mode: 'create' | 'edit') => UserFormErrors;
}

export function useUserSave(): UseUserSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const tenantId = authUser?.tenantId;

  const validate = useCallback((data: UserFormData, _mode: 'create' | 'edit'): UserFormErrors => {
    const errors: UserFormErrors = {};

    Object.assign(errors, validateRequired(data, REQUIRED_FIELDS));

    const emailError = validateEmail(data.email);
    if (emailError) errors.email = emailError;

    return errors;
  }, []);

  const save = useCallback(async (data: UserFormData, userId?: string): Promise<SaveResult> => {
    if (!tenantId) return { success: false, error: 'No tenant context' };

    setIsSaving(true);
    try {
      const payload = {
        name: data.name,
        email: data.email,
        phone: data.phone || undefined,
        role: data.role || undefined,
        status: data.status || undefined,
        branchId: data.branchId || undefined,
      };

      if (userId) {
        const { error } = await api.PATCH(`/v1/tenants/${tenantId}/users/${userId}` as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST(`/v1/tenants/${tenantId}/users` as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      }

      await queryClient.invalidateQueries({ queryKey: ['users'] });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient, tenantId]);

  return { save, isSaving, validate };
}
