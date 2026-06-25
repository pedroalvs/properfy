import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/lib/api-error';
import { UserRole } from '@properfy/shared';
import { consumePostLoginRedirect } from '@/lib/post-login-redirect';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'AUTH_INVALID_CREDENTIALS':
        return 'Invalid email or password.';
      case 'AUTH_ACCOUNT_LOCKED':
        return 'Account locked. Please try again later.';
      case 'AUTH_USER_INACTIVE':
        return 'Account is inactive. Contact your administrator.';
      case 'AUTH_TOTP_REQUIRED':
        return 'Enter the 6-digit code from your authenticator app.';
      case 'AUTH_TOTP_INVALID':
        return 'Invalid two-factor authentication code.';
      case 'AUTH_ROLE_NOT_SUPPORTED':
        return 'This app is only available for inspectors. Use the web portal for admin or agency access.';
      case 'VALIDATION_ERROR':
        return 'Please check your email and password format.';
      default:
        break;
    }
    if (error.status === 429) return 'Too many attempts. Wait a moment and try again.';
    if (error.status >= 500) return 'Server is temporarily unavailable. Try again shortly.';
    return 'Invalid email or password.';
  }
  return 'Something went wrong. Check your connection and try again.';
}

export function LoginPage() {
  const { login, user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== UserRole.INSP) return;
    const target = consumePostLoginRedirect() ?? '/schedule';
    navigate(target, { replace: true });
  }, [isAuthenticated, navigate, user?.role]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <i className="mdi mdi-loading mdi-spin text-2xl text-primary" aria-hidden="true" />
        </div>
        <p className="mt-4 text-sm text-text-secondary">Restoring session...</p>
      </div>
    );
  }
  if (isAuthenticated && user?.role === UserRole.INSP) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password, requiresTotp ? totpCode.trim() : undefined);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'AUTH_TOTP_REQUIRED') {
        setRequiresTotp(true);
      }
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Brand header */}
      <div className="flex flex-col items-center px-6 pt-16 pb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary shadow-lg shadow-primary/25">
          <i className="mdi mdi-clipboard-check-outline text-[32px] text-white" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-secondary">Properfy</h1>
        <p className="mt-1 text-sm font-medium text-text-secondary">Inspector Field App</p>
      </div>

      {/* Form card */}
      <div className="flex-1 px-5 pb-8">
        <div className="mx-auto w-full max-w-sm">
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-error/15 bg-error/8 px-4 py-3 text-sm leading-relaxed text-error"
                data-testid="login-error"
              >
                {error}
              </div>
            )}

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
                className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-text-primary shadow-sm outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                data-testid="email-input"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-text-secondary">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-text-primary shadow-sm outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                data-testid="password-input"
              />
            </div>

            {requiresTotp && (
              <div>
                <label htmlFor="totp-code" className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Authentication Code
                </label>
                <input
                  id="totp-code"
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="123456"
                  className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm tracking-[0.3em] text-text-primary shadow-sm outline-none transition-all placeholder:tracking-normal placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                  data-testid="totp-input"
                />
                <p className="mt-1.5 text-xs text-text-muted">
                  Open your authenticator app and enter the current 6-digit code.
                </p>
              </div>
            )}

            <Button
              type="submit"
              loading={isSubmitting}
              className="!w-full !min-h-[50px] !rounded-2xl !shadow-lg !shadow-real-estate/20"
              data-testid="login-button"
            >
              Sign In
            </Button>
          </form>

          {/* Context */}
          <div className="mt-6 rounded-2xl border border-primary/8 bg-primary/4 px-4 py-3">
            <p className="text-xs leading-relaxed text-text-secondary">
              <span className="font-semibold">Inspector access only.</span>{' '}
              Your schedule, offers and inspections are available here. Agency and admin users should use the{' '}
              <span className="font-medium text-primary">web portal</span>.
            </p>
          </div>

          <p className="mt-6 text-center text-[11px] text-text-muted">
            Can't sign in? Contact your operations team for access.
          </p>
        </div>
      </div>
    </div>
  );
}
