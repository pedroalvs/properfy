import { useState, useCallback } from 'react';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { Button } from '@/components/ui/Button';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useChangePassword } from '../hooks/useChangePassword';
import type { ChangePasswordFormData, ChangePasswordFormErrors } from '../types';
import { EMPTY_CHANGE_PASSWORD_FORM } from '../types';

export function ChangePasswordForm() {
  const { logout } = useAuth();
  const { changePassword, isChanging, validate } = useChangePassword();
  const { showSuccess, showError } = useSnackbar();
  const [form, setForm] = useState<ChangePasswordFormData>(EMPTY_CHANGE_PASSWORD_FORM);
  const [errors, setErrors] = useState<ChangePasswordFormErrors>({});

  const updateField = useCallback(
    <K extends keyof ChangePasswordFormData>(field: K, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        if (prev[field]) {
          const next = { ...prev };
          delete next[field];
          return next;
        }
        return prev;
      });
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await changePassword(form);
    if (result.success) {
      showSuccess('Password changed. Please sign in again.');
      setForm(EMPTY_CHANGE_PASSWORD_FORM);
      setErrors({});
      window.setTimeout(() => {
        logout();
      }, 1200);
    } else {
      showError(result.error ?? 'Failed to change password');
    }
  }, [form, validate, changePassword, showSuccess, showError, logout]);

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <FormSection title="Change Password">
        <div className="flex max-w-md flex-col gap-4">
          <FormField label="Current Password" required error={errors.currentPassword}>
            <TextInput
              type="password"
              value={form.currentPassword}
              onChange={(v) => updateField('currentPassword', v)}
              placeholder="Enter current password"
              error={!!errors.currentPassword}
              aria-label="Current Password"
            />
          </FormField>
          <FormField label="New Password" required error={errors.newPassword}>
            <TextInput
              type="password"
              value={form.newPassword}
              onChange={(v) => updateField('newPassword', v)}
              placeholder="Enter new password"
              error={!!errors.newPassword}
              aria-label="New Password"
            />
          </FormField>
          <FormField label="Confirm Password" required error={errors.confirmPassword}>
            <TextInput
              type="password"
              value={form.confirmPassword}
              onChange={(v) => updateField('confirmPassword', v)}
              placeholder="Confirm new password"
              error={!!errors.confirmPassword}
              aria-label="Confirm Password"
            />
          </FormField>
          <div className="flex justify-end">
            <Button variant="primary" loading={isChanging} onClick={handleSubmit}>
              Change Password
            </Button>
          </div>
        </div>
      </FormSection>
    </div>
  );
}
