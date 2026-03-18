import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import type { ChangePasswordFormData, ChangePasswordFormErrors } from '../types';

const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(data: ChangePasswordFormData): ChangePasswordFormErrors {
  const errors: ChangePasswordFormErrors = {};

  if (!data.currentPassword.trim()) {
    errors.currentPassword = 'Required field';
  }

  if (!data.newPassword.trim()) {
    errors.newPassword = 'Required field';
  } else if (data.newPassword.length < MIN_PASSWORD_LENGTH) {
    errors.newPassword = `Must be at least ${MIN_PASSWORD_LENGTH} characters`;
  } else if (!/[A-Z]/.test(data.newPassword)) {
    errors.newPassword = 'Must contain an uppercase letter';
  } else if (!/[a-z]/.test(data.newPassword)) {
    errors.newPassword = 'Must contain a lowercase letter';
  } else if (!/\d/.test(data.newPassword)) {
    errors.newPassword = 'Must contain a number';
  } else if (!/[^A-Za-z0-9]/.test(data.newPassword)) {
    errors.newPassword = 'Must contain a special character';
  }

  if (!data.confirmPassword.trim()) {
    errors.confirmPassword = 'Required field';
  } else if (data.newPassword !== data.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return errors;
}

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface UseChangePasswordReturn {
  changePassword: (data: ChangePasswordFormData) => Promise<SaveResult>;
  isChanging: boolean;
  validate: (data: ChangePasswordFormData) => ChangePasswordFormErrors;
}

export function useChangePassword(): UseChangePasswordReturn {
  const [isChanging, setIsChanging] = useState(false);

  const validate = useCallback((data: ChangePasswordFormData): ChangePasswordFormErrors => {
    return validatePassword(data);
  }, []);

  const changePassword = useCallback(async (data: ChangePasswordFormData): Promise<SaveResult> => {
    setIsChanging(true);
    try {
      const { error } = await api.POST('/v1/auth/change-password' as any, {
        body: {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        } as any,
      });
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password';
      return { success: false, error: message };
    } finally {
      setIsChanging(false);
    }
  }, []);

  return { changePassword, isChanging, validate };
}
