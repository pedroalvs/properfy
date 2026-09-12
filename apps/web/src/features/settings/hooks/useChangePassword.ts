import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { getErrorMessage, toApiError } from '@/lib/api-error';
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
      const { error, response } = await api.POST('/v1/auth/change-password', {
        body: {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        },
      });
      // Read response.status BEFORE narrowing on `error`: this endpoint's
      // OpenAPI schema declares no error response shape, so `error`'s type is
      // `never` — inside `if (error)` TS treats the branch as unreachable and
      // collapses every other binding (including `response`) to `never` too.
      const status = response.status;
      if (error) throw toApiError(error, status);
      return { success: true };
    } catch (err) {
      return { success: false, error: getErrorMessage(err, 'Failed to change password') };
    } finally {
      setIsChanging(false);
    }
  }, []);

  return { changePassword, isChanging, validate };
}
