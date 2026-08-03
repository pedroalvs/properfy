import { useState, useCallback, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { passwordFieldSchema, PASSWORD_REQUIREMENTS_MESSAGE } from '@properfy/shared';
import { PasswordStrengthIndicator } from '@/components/forms/PasswordStrengthIndicator';
import { useResetPassword } from '../hooks/useResetPassword';
import { AuthLayout } from '../components/AuthLayout';
import { AuthPasswordField } from '../components/AuthPasswordField';
import { AuthAlert } from '../components/AuthAlert';
import { AuthSubmitButton } from '../components/AuthSubmitButton';

interface ValidationErrors {
  newPassword?: string;
  confirmPassword?: string;
}

function validate(newPassword: string, confirmPassword: string): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!newPassword) {
    errors.newPassword = 'Required field';
  } else if (!passwordFieldSchema.safeParse(newPassword).success) {
    errors.newPassword = PASSWORD_REQUIREMENTS_MESSAGE;
  }

  if (!confirmPassword) {
    errors.confirmPassword = 'Required field';
  } else if (newPassword !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return errors;
}

function InvalidLinkState() {
  return (
    <>
      <p className="text-sm leading-6 text-text-secondary">
        This reset link is invalid or has expired. Reset links are valid for 1 hour and can only be
        used once.
      </p>
      <div className="mt-8 flex items-center justify-between gap-4">
        <Link to="/login" className="text-sm font-bold text-primary transition hover:underline">
          Back to Sign In
        </Link>
        <Link
          to="/forgot-password"
          className="inline-flex h-11 items-center justify-center rounded bg-real-estate px-7 text-sm font-bold text-white transition hover:brightness-95 active:brightness-90"
        >
          Request a New Link
        </Link>
      </div>
    </>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const { resetPassword, isLoading, isSuccess, error, isInvalidToken } = useResetPassword();

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!token) return;

      const errors = validate(newPassword, confirmPassword);
      setValidationErrors(errors);
      if (Object.keys(errors).length > 0) return;

      await resetPassword(token, newPassword);
    },
    [token, newPassword, confirmPassword, resetPassword],
  );

  if (!token) {
    return (
      <AuthLayout title="Link not valid" subtitle="This link can no longer be used.">
        <InvalidLinkState />
      </AuthLayout>
    );
  }

  if (isSuccess) {
    return (
      <AuthLayout title="Password updated" subtitle="You're all set.">
        <p className="text-sm leading-6 text-text-secondary">
          Your password has been reset and all previous sessions were signed out. You can now sign
          in with your new password.
        </p>
        <div className="mt-8">
          <Link
            to="/login"
            className="inline-flex h-11 items-center justify-center rounded bg-real-estate px-7 text-sm font-bold text-white transition hover:brightness-95 active:brightness-90"
          >
            Go to Sign In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Make it a strong one.">
      {error && (
        <AuthAlert>
          {error}
          {isInvalidToken && (
            <div className="mt-2">
              <Link
                to="/forgot-password"
                className="font-bold text-primary transition hover:underline"
              >
                Request a new link
              </Link>
            </div>
          )}
        </AuthAlert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <AuthPasswordField
          id="reset-new-password"
          label="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
          disabled={isLoading}
          error={validationErrors.newPassword}
          hint="At least 8 characters, with uppercase, lowercase, a number and a special character."
        />

        <div>
          <AuthPasswordField
            id="reset-confirm-password"
            label="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={isLoading}
            error={validationErrors.confirmPassword}
          />
          <PasswordStrengthIndicator password={newPassword} confirmPassword={confirmPassword} />
        </div>

        <div className="flex items-center justify-between gap-4 pt-2">
          <Link to="/login" className="text-sm font-bold text-primary transition hover:underline">
            Back to Sign In
          </Link>
          <AuthSubmitButton loading={isLoading}>Reset Password</AuthSubmitButton>
        </div>
      </form>
    </AuthLayout>
  );
}
