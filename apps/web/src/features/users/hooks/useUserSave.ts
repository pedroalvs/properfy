import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { contactSchema, type UserRole } from '@properfy/shared';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage, toApiError } from '@/lib/api-error';
import type { UserFormData, UserFormErrors, UserScope } from '../types';

// AM/OP/CL_ADMIN/CL_USER/INSP are the only roles the users-management endpoints
// accept — TNT (rental tenant portal) and SYS have no user-management route.
type AssignableUserRole = Exclude<UserRole, 'TNT' | 'SYS'>;

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

export function useUserSave(
  overrideTenantId?: string,
  scope: UserScope = 'tenant',
): UseUserSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const tenantId = scope === 'tenant' ? (overrideTenantId ?? authUser?.tenantId) : null;

  const validate = useCallback((data: UserFormData, mode: 'create' | 'edit'): UserFormErrors => {
    const errors: UserFormErrors = {};

    Object.assign(errors, validateRequired(data, REQUIRED_FIELDS));

    const emailError = validateEmail(data.email);
    if (emailError) errors.email = emailError;

    Object.assign(errors, validatePassword(data, mode));

    return errors;
  }, []);

  const save = useCallback(async (data: UserFormData, userId?: string): Promise<SaveResult> => {
    if (scope === 'tenant' && !tenantId) return { success: false, error: 'No agency context' };

    setIsSaving(true);
    try {
      if (userId) {
        if (scope === 'internal') {
          const { error, response } = await api.PATCH('/v1/users/{userId}', {
            params: { path: { userId } },
            body: {
              name: data.name,
              phone: data.phone || undefined,
              role: (data.role || undefined) as AssignableUserRole | undefined,
              // Personal timezone is internal-scope only (CL_* inherit the
              // agency's; the backend rejects it for those targets). Cleared
              // -> explicit null.
              timezone: data.timezone || null,
            },
          });
          const status = response.status;
          if (error) throw toApiError(error, status);
        } else {
          const { error, response } = await api.PATCH('/v1/tenants/{tenantId}/users/{userId}', {
            params: { path: { tenantId: tenantId as string, userId } },
            body: {
              name: data.name,
              phone: data.phone || undefined,
              role: (data.role || undefined) as AssignableUserRole | undefined,
              branchId: data.branchId || undefined,
            },
          });
          const status = response.status;
          if (error) throw toApiError(error, status);
        }
      } else if (scope === 'internal') {
        const { error, response } = await api.POST('/v1/users', {
          body: {
            name: data.name,
            email: data.email,
            password: data.password,
            phone: data.phone || undefined,
            role: data.role as AssignableUserRole,
            // On create an unset timezone is simply omitted (platform default).
            ...(data.timezone ? { timezone: data.timezone } : {}),
          },
        });
        const status = response.status;
        if (error) throw toApiError(error, status);
      } else {
        const { error, response } = await api.POST('/v1/tenants/{tenantId}/users', {
          params: { path: { tenantId: tenantId as string } },
          body: {
            name: data.name,
            email: data.email,
            password: data.password,
            phone: data.phone || undefined,
            role: data.role as AssignableUserRole,
            branchId: data.branchId || undefined,
          },
        });
        const status = response.status;
        if (error) throw toApiError(error, status);
      }

      await queryClient.invalidateQueries({ queryKey: ['users'] });
      return { success: true };
    } catch (err) {
      return { success: false, error: getErrorMessage(err, 'Failed to save') };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient, scope, tenantId]);

  return { save, isSaving, validate };
}
