import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { passwordFieldSchema } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api';
import { ApiError, toApiError } from '@/lib/api-error';

const INVALID_TOKEN_CODE = 'AUTH_INVALID_RESET_TOKEN';

function getErrorMessage(error: unknown): { message: string; invalidToken: boolean } {
  if (error instanceof ApiError) {
    if (error.code === INVALID_TOKEN_CODE) {
      return {
        message: 'This reset link is invalid or has expired. Please request a new link.',
        invalidToken: true,
      };
    }
    if (error.status === 429) {
      return { message: 'Too many attempts. Please wait and try again.', invalidToken: false };
    }
    if (error.status >= 500) {
      return {
        message: 'Server is temporarily unavailable. Try again shortly.',
        invalidToken: false,
      };
    }
    return { message: error.message, invalidToken: false };
  }
  return {
    message: 'Something went wrong. Check your connection and try again.',
    invalidToken: false,
  };
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex flex-col items-center px-6 pt-16 pb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary shadow-lg shadow-primary/25">
          <i className="mdi mdi-lock-reset text-[32px] text-white" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-secondary">Reset Password</h1>
        <p className="mt-1 text-sm font-medium text-text-secondary">Inspector Field App</p>
      </div>
      <div className="flex-1 px-5 pb-8">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

function InvalidLinkState() {
  return (
    <div className="rounded-2xl border border-black/5 bg-white px-5 py-6 shadow-sm">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-error/10">
        <i className="mdi mdi-link-variant-off text-2xl text-error" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold text-secondary">Link not valid</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
        This reset link is invalid or has expired. Reset links are valid for 1 hour and can only
        be used once.
      </p>
      <Link
        to="/forgot-password"
        className="mt-5 flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-real-estate text-sm font-semibold text-white shadow-lg shadow-real-estate/20 transition hover:brightness-95 active:brightness-90"
      >
        Request a New Link
      </Link>
      <div className="mt-4 text-center">
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
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [error, setError] = useState('');
  const [isInvalidToken, setIsInvalidToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!token) {
    return (
      <PageShell>
        <InvalidLinkState />
      </PageShell>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNewPasswordError('');
    setConfirmPasswordError('');
    setIsInvalidToken(false);

    if (!passwordFieldSchema.safeParse(newPassword).success) {
      setNewPasswordError('Min 8 chars, uppercase, lowercase, number and special character');
      return;
    }
    if (newPassword !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: apiError, response } = await api.POST('/v1/auth/reset-password', {
        body: { token, newPassword },
      });

      if (apiError) throw toApiError(apiError, (response as Response | undefined)?.status);

      setIsSuccess(true);
    } catch (err) {
      const parsed = getErrorMessage(err);
      setError(parsed.message);
      setIsInvalidToken(parsed.invalidToken);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <PageShell>
        <div className="rounded-2xl border border-black/5 bg-white px-5 py-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10">
            <i className="mdi mdi-lock-check-outline text-2xl text-success" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-secondary">Password updated</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Your password has been reset and all previous sessions were signed out. You can now
            sign in with your new password.
          </p>
          <Link
            to="/login"
            className="mt-5 flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-real-estate text-sm font-semibold text-white shadow-lg shadow-real-estate/20 transition hover:brightness-95 active:brightness-90"
          >
            Go to Sign In
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <form onSubmit={handleSubmit} noValidate className="space-y-4" data-testid="reset-password-form">
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-error/15 bg-error/8 px-4 py-3 text-sm leading-relaxed text-error"
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

        <p className="text-sm leading-relaxed text-text-secondary">
          Your new password must be at least 8 characters and include uppercase, lowercase, a
          number and a special character.
        </p>

        <div>
          <label
            htmlFor="new-password"
            className="mb-1.5 block text-sm font-medium text-text-secondary"
          >
            New Password
          </label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
            disabled={isSubmitting}
            aria-invalid={newPasswordError ? true : undefined}
            aria-describedby={newPasswordError ? 'new-password-error' : undefined}
            className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-text-primary shadow-sm outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          {newPasswordError && (
            <p id="new-password-error" className="mt-1.5 text-xs text-error">
              {newPasswordError}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirm-password"
            className="mb-1.5 block text-sm font-medium text-text-secondary"
          >
            Confirm Password
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            disabled={isSubmitting}
            aria-invalid={confirmPasswordError ? true : undefined}
            aria-describedby={confirmPasswordError ? 'confirm-password-error' : undefined}
            className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-text-primary shadow-sm outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          {confirmPasswordError && (
            <p id="confirm-password-error" className="mt-1.5 text-xs text-error">
              {confirmPasswordError}
            </p>
          )}
        </div>

        <Button
          type="submit"
          loading={isSubmitting}
          className="!w-full !min-h-[50px] !rounded-2xl !shadow-lg !shadow-real-estate/20"
        >
          Reset Password
        </Button>

        <div className="pt-2 text-center">
          <Link to="/login" className="text-sm font-semibold text-primary transition hover:underline">
            Back to Sign In
          </Link>
        </div>
      </form>
    </PageShell>
  );
}
