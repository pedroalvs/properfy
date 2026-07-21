import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api';
import { ApiError, toApiError } from '@/lib/api-error';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many attempts. Please wait and try again.';
    if (error.status >= 500) return 'Server is temporarily unavailable. Try again shortly.';
    return error.message;
  }
  return 'Something went wrong. Check your connection and try again.';
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = email.trim();
    if (!trimmed || !isValidEmail(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: apiError, response } = await api.POST('/v1/auth/forgot-password', {
        body: { email: trimmed },
      });

      if (apiError) throw toApiError(apiError, (response as Response | undefined)?.status);

      setIsSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <div className="mx-auto w-full max-w-sm">
          {isSuccess ? (
            <div className="rounded-2xl border border-black/5 bg-white px-5 py-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10">
                <i className="mdi mdi-email-check-outline text-2xl text-success" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-bold text-secondary">Check your email</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                If an account exists for{' '}
                <span className="font-semibold text-text-primary">{email.trim()}</span>, you will
                receive a password reset link shortly. Check your spam folder if it doesn't
                arrive within a few minutes.
              </p>
              <Link
                to="/login"
                className="mt-5 flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-real-estate text-sm font-semibold text-white shadow-lg shadow-real-estate/20 transition hover:brightness-95 active:brightness-90"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4" data-testid="forgot-password-form">
              {error && (
                <div
                  role="alert"
                  className="rounded-2xl border border-error/15 bg-error/8 px-4 py-3 text-sm leading-relaxed text-error"
                >
                  {error}
                </div>
              )}

              <p className="text-sm leading-relaxed text-text-secondary">
                Enter the email you use to sign in and we'll send you a link to reset your
                password.
              </p>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="your@email.com"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-text-primary shadow-sm outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
              </div>

              <Button
                type="submit"
                loading={isSubmitting}
                className="!w-full !min-h-[50px] !rounded-2xl !shadow-lg !shadow-real-estate/20"
              >
                Send Reset Link
              </Button>

              <div className="pt-2 text-center">
                <Link
                  to="/login"
                  className="text-sm font-semibold text-primary transition hover:underline"
                >
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
