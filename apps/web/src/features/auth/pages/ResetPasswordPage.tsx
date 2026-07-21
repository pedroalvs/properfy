import { useState, useCallback, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { passwordFieldSchema, PASSWORD_REQUIREMENTS_MESSAGE } from '@properfy/shared';
import { PasswordStrengthIndicator } from '@/components/forms/PasswordStrengthIndicator';
import { useResetPassword } from '../hooks/useResetPassword';

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

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-5 py-8 sm:px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3">
            <img
              src="/images/properfy-icon-square.png"
              alt=""
              className="h-10 w-10 rounded-xl bg-white p-1 shadow-sm"
            />
            <div className="text-left">
              <p className="font-poppins text-lg font-semibold text-secondary">Properfy</p>
              <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
                Property Inspection Platform
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[28px] border border-black/8 bg-card-bg p-6 shadow-[0_20px_50px_rgba(33,86,110,0.08)] sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

function InvalidLinkState() {
  return (
    <div>
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-error/10">
        <i className="mdi mdi-link-variant-off text-2xl text-error" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-secondary/65">
        Password Reset
      </p>
      <h2 className="mt-3 font-poppins text-3xl font-semibold tracking-tight text-secondary">
        Link not valid
      </h2>
      <p className="mt-3 text-sm leading-6 text-text-secondary">
        This reset link is invalid or has expired. Reset links are valid for 1 hour and can only
        be used once.
      </p>
      <div className="mt-6">
        <Link
          to="/forgot-password"
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-real-estate px-4 text-sm font-semibold text-white transition hover:brightness-95 active:brightness-90"
        >
          Request a New Link
        </Link>
      </div>
      <div className="mt-6 text-center">
        <Link to="/login" className="text-sm font-semibold text-primary transition hover:underline">
          Back to Sign In
        </Link>
      </div>
    </div>
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
      <CardShell>
        <InvalidLinkState />
      </CardShell>
    );
  }

  if (isSuccess) {
    return (
      <CardShell>
        <div>
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
            <i className="mdi mdi-lock-check-outline text-2xl text-success" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-secondary/65">
            All Done
          </p>
          <h2 className="mt-3 font-poppins text-3xl font-semibold tracking-tight text-secondary">
            Password updated
          </h2>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Your password has been reset and all previous sessions were signed out. You can now
            sign in with your new password.
          </p>
          <div className="mt-6">
            <Link
              to="/login"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-real-estate px-4 text-sm font-semibold text-white transition hover:brightness-95 active:brightness-90"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell>
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-secondary/65">
          Password Reset
        </p>
        <h2 className="mt-3 font-poppins text-3xl font-semibold tracking-tight text-secondary">
          Choose a new password
        </h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Your new password must be at least 8 characters and include uppercase, lowercase, a
          number and a special character.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-2xl border border-error/15 bg-error/5 px-4 py-3 text-sm leading-6 text-error"
        >
          {error}
          {isInvalidToken && (
            <div className="mt-2">
              <Link
                to="/forgot-password"
                className="font-semibold text-primary transition hover:underline"
              >
                Request a new link
              </Link>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label
            htmlFor="reset-new-password"
            className="mb-2 block text-sm font-semibold text-text-secondary"
          >
            New Password
          </label>
          <input
            id="reset-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            disabled={isLoading}
            aria-invalid={validationErrors.newPassword ? true : undefined}
            aria-describedby={validationErrors.newPassword ? 'reset-new-password-error' : undefined}
            className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          {validationErrors.newPassword && (
            <p id="reset-new-password-error" className="mt-1.5 text-xs text-error">
              {validationErrors.newPassword}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="reset-confirm-password"
            className="mb-2 block text-sm font-semibold text-text-secondary"
          >
            Confirm Password
          </label>
          <input
            id="reset-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={isLoading}
            aria-invalid={validationErrors.confirmPassword ? true : undefined}
            aria-describedby={validationErrors.confirmPassword ? 'reset-confirm-password-error' : undefined}
            className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          {validationErrors.confirmPassword && (
            <p id="reset-confirm-password-error" className="mt-1.5 text-xs text-error">
              {validationErrors.confirmPassword}
            </p>
          )}
          <PasswordStrengthIndicator password={newPassword} confirmPassword={confirmPassword} />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-real-estate px-4 text-sm font-semibold text-white transition hover:brightness-95 active:brightness-90 disabled:pointer-events-none disabled:opacity-50"
        >
          {isLoading && <i className="mdi mdi-loading mdi-spin text-base" aria-hidden="true" />}
          Reset Password
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link to="/login" className="text-sm font-semibold text-primary transition hover:underline">
          Back to Sign In
        </Link>
      </div>
    </CardShell>
  );
}
