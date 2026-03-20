import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { contactSchema } from '@properfy/shared';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { UserFormData, UserFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

const REQUIRED_FIELDS: (keyof UserFormData)[] = ['name', 'email', 'role'];
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,128}$/;

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

function validatePassword(data: UserFormData, mode: 'create' | 'edit'): UserFormErrors {
  const errors: UserFormErrors = {};
  if (mode === 'create') {
    if (!data.password) {
      errors.password = REQUIRED_FIELD_MESSAGE;
    } else if (!PASSWORD_REGEX.test(data.password)) {
      errors.password = 'Min 8 chars, uppercase, lowercase, number and special character';
    } else if (data.password !== data.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
  }
  return errors;
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

export function useUserSave(overrideTenantId?: string): UseUserSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const tenantId = overrideTenantId ?? authUser?.tenantId;

  const validate = useCallback((data: UserFormData, mode: 'create' | 'edit'): UserFormErrors => {
    const errors: UserFormErrors = {};

    Object.assign(errors, validateRequired(data, REQUIRED_FIELDS));

    const emailError = validateEmail(data.email);
    if (emailError) errors.email = emailError;

    Object.assign(errors, validatePassword(data, mode));

    return errors;
  }, []);

  const save = useCallback(async (data: UserFormData, userId?: string): Promise<SaveResult> => {
    if (!tenantId) return { success: false, error: 'No tenant context' };

    setIsSaving(true);
    try {
      if (userId) {
        const payload = {
          name: data.name,
          phone: data.phone || undefined,
          role: data.role || undefined,
          branchId: data.branchId || undefined,
        };
        const { error } = await api.PATCH(`/v1/tenants/${tenantId}/users/${userId}` as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const payload = {
          name: data.name,
          email: data.email,
          password: data.password,
          phone: data.phone || undefined,
          role: data.role || undefined,
          branchId: data.branchId || undefined,
        };
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
