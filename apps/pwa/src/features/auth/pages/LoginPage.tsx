import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/lib/api-error';
import { UserRole } from '@properfy/shared';

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
        return 'Two-factor authentication code required.';
      case 'AUTH_ROLE_NOT_SUPPORTED':
        return 'This app is only available for inspectors. Use the web portal for admin or agency access.';
      case 'VALIDATION_ERROR':
        return 'Invalid email or password format.';
      default:
        break;
    }
    if (error.status === 429) return 'Too many attempts. Please wait.';
    if (error.status >= 500) return 'Server error. Please try again later.';
    return 'Invalid email or password.';
  }
  return 'An unexpected error occurred.';
}

export function LoginPage() {
  const { login, user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg px-page-x">
        <p className="text-sm text-text-secondary">Loading Properfy Inspector...</p>
      </div>
    );
  }
  if (isAuthenticated && user?.role === UserRole.INSP) return <Navigate to="/schedule" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.10),_transparent_42%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-page-x py-8">
      <div className="w-full max-w-sm">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(59,130,246,0.15)]">
              <i className="mdi mdi-clipboard-account-outline text-[28px]" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-page-title text-secondary">Properfy</h1>
            <p className="mt-1 text-sm text-text-secondary">Inspector Login</p>
            <p className="mt-2 text-xs leading-5 text-text-muted">
              Mobile workspace for field inspections, schedules and offer intake.
            </p>
          </div>

          <div className="mt-5 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-text-secondary">
            This mobile app is for inspectors only. Admin and agency access should use the Properfy web portal.
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" data-testid="login-form">
            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error"
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
                className="h-12 w-full rounded-2xl border border-border-subtle bg-app-bg/80 px-3.5 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
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
                className="h-12 w-full rounded-2xl border border-border-subtle bg-app-bg/80 px-3.5 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                data-testid="password-input"
              />
            </div>

            <Button
              type="submit"
              loading={isSubmitting}
              className="!w-full !min-h-[50px] !rounded-2xl"
              data-testid="login-button"
            >
              Sign In
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
