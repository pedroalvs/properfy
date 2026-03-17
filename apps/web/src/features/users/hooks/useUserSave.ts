import { useState, useCallback } from 'react';
import { contactSchema, UserStatus, UserRole } from '@properfy/shared';
import type { UserRole as UserRoleType, UserStatus as UserStatusType } from '@properfy/shared';
import type { UserFormData, UserFormErrors } from '../types';
import { MOCK_USERS } from '../mocks/users';
import { BRANCH_OPTIONS } from '../mocks/form-options';

const REQUIRED_FIELD_MESSAGE = 'Campo obrigatório';

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
  if (!result.success) return 'E-mail inválido';
  return undefined;
}

export interface UseUserSaveReturn {
  save: (data: UserFormData, userId?: string) => Promise<boolean>;
  isSaving: boolean;
  validate: (data: UserFormData, mode: 'create' | 'edit') => UserFormErrors;
}

export function useUserSave(): UseUserSaveReturn {
  const [isSaving, setIsSaving] = useState(false);

  const validate = useCallback((data: UserFormData, _mode: 'create' | 'edit'): UserFormErrors => {
    const errors: UserFormErrors = {};

    Object.assign(errors, validateRequired(data, REQUIRED_FIELDS));

    const emailError = validateEmail(data.email);
    if (emailError) errors.email = emailError;

    return errors;
  }, []);

  const save = useCallback(async (data: UserFormData, userId?: string): Promise<boolean> => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const branchName = BRANCH_OPTIONS.find((b) => b.value === data.branchId)?.label ?? null;

    if (userId) {
      const idx = MOCK_USERS.findIndex((u) => u.id === userId);
      if (idx !== -1) {
        const existing = MOCK_USERS[idx]!;
        MOCK_USERS[idx] = {
          ...existing,
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          role: (data.role || existing.role) as UserRoleType,
          status: (data.status || existing.status) as UserStatusType,
          branchId: data.branchId || null,
          branchName,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      MOCK_USERS.push({
        id: `usr-${Date.now()}`,
        tenantId: null,
        branchId: data.branchId || null,
        branchName,
        role: data.role as UserRoleType,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        status: UserStatus.ACTIVE,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        permissions: [],
        twoFactorEnabled: false,
      });
    }

    setIsSaving(false);
    return true;
  }, []);

  return { save, isSaving, validate };
}
