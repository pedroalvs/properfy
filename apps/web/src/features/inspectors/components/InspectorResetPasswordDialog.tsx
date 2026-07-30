import { useCallback, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { PasswordStrengthIndicator } from '@/components/forms/PasswordStrengthIndicator';
import { useSnackbar } from '@/hooks/useSnackbar';
import {
  type InspectorResetPasswordFormData,
  type InspectorResetPasswordErrors,
  useInspectorResetPassword,
} from '../hooks/useInspectorResetPassword';

const EMPTY_FORM: InspectorResetPasswordFormData = {
  newPassword: '',
  confirmPassword: '',
};

interface InspectorResetPasswordDialogProps {
  open: boolean;
  inspectorId: string | null;
  inspectorName?: string | null;
  onClose: () => void;
  onReset?: () => void;
}

export function InspectorResetPasswordDialog({
  open,
  inspectorId,
  inspectorName,
  onClose,
  onReset,
}: InspectorResetPasswordDialogProps) {
  const [form, setForm] = useState<InspectorResetPasswordFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<InspectorResetPasswordErrors>({});
  const { showSuccess, showError } = useSnackbar();
  const { resetPassword, validate, isResetting } = useInspectorResetPassword();

  const title = useMemo(
    () => `Reset Password${inspectorName ? `: ${inspectorName}` : ''}`,
    [inspectorName],
  );

  const updateField = useCallback(
    <K extends keyof InspectorResetPasswordFormData>(field: K, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  const handleClose = useCallback(() => {
    setForm(EMPTY_FORM);
    setErrors({});
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!inspectorId) return;

    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await resetPassword(inspectorId, form);
    if (!result.success) {
      showError(result.error ?? 'Failed to reset password');
      return;
    }

    showSuccess('Password reset successfully. Existing sessions were revoked.');
    setForm(EMPTY_FORM);
    setErrors({});
    onReset?.();
    onClose();
  }, [form, inspectorId, onClose, onReset, resetPassword, showError, showSuccess, validate]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      actions={(
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isResetting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={isResetting}>
            Reset Password
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          Define a new password for this inspector. The system will revoke all active sessions.
        </p>
        <FormField label="New Password" required error={errors.newPassword}>
          <TextInput
            type="password"
            value={form.newPassword}
            onChange={(value) => updateField('newPassword', value)}
            placeholder="Enter new password"
            error={!!errors.newPassword}
            aria-label="New Password"
          />
          <PasswordStrengthIndicator
            password={form.newPassword}
            confirmPassword={form.confirmPassword}
          />
        </FormField>
        <FormField label="Confirm Password" required error={errors.confirmPassword}>
          <TextInput
            type="password"
            value={form.confirmPassword}
            onChange={(value) => updateField('confirmPassword', value)}
            placeholder="Confirm new password"
            error={!!errors.confirmPassword}
            aria-label="Confirm Password"
          />
        </FormField>
      </div>
    </Dialog>
  );
}
