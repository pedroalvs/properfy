import { useState, useCallback, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ApiError, getErrorMessage } from '@/lib/api-error';
import { consumePostLoginRedirect } from '@/lib/post-login-redirect';

function getLoginErrorMessage(error: unknown): string {
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
      case 'VALIDATION_ERROR':
        return 'Invalid email or password format. Please check and try again.';
      default:
        break;
    }
    if (error.status === 429) return 'Too many attempts. Please wait and try again.';
    if (error.status >= 500) return 'Server error. Please try again later.';
  }
  return getErrorMessage(error, 'An unexpected error occurred. Please try again.');
}

export function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    navigate(consumePostLoginRedirect() ?? '/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!email.trim() || !password) {
        setError('Please enter your email and password.');
        return;
      }

      setIsSubmitting(true);
      try {
        await login(email.trim(), password, requiresTotp ? totpCode.trim() : undefined);
        navigate(consumePostLoginRedirect() ?? '/', { replace: true });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'AUTH_TOTP_REQUIRED') {
          setRequiresTotp(true);
        }
        setError(getLoginErrorMessage(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, login, navigate, requiresTotp, totpCode],
  );

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg px-6">
        <div className="flex flex-col items-center gap-4 rounded-[20px] border border-border-subtle bg-card-bg px-8 py-10 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/8">
            <i className="mdi mdi-loading mdi-spin text-2xl text-secondary" aria-hidden="true" />
          </div>
          <div className="text-center">
            <p className="font-poppins text-lg font-semibold text-secondary">Restoring session</p>
            <p className="mt-1 text-sm text-text-secondary">Checking your access and workspace.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-app-bg">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <section className="relative hidden overflow-hidden bg-secondary px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(65,166,157,0.28),transparent_28%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/8 px-4 py-2 backdrop-blur-sm">
              <img src="/images/properfy-icon-square.png" alt="" className="h-8 w-8 rounded-lg bg-white/90 p-1" />
              <div>
                <p className="font-poppins text-base font-semibold leading-tight">Properfy</p>
                <p className="text-xs uppercase tracking-[0.18em] text-white/70">
                  Property Inspection Platform
                </p>
              </div>
            </div>

            <div className="mt-16 max-w-xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/70">
                Operations Workspace
              </p>
              <h1 className="mt-5 font-poppins text-4xl font-semibold leading-tight">
                Keep scheduling, inspections and financial follow-up in one operational flow.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/78">
                Sign in to manage appointments, coordinate agencies and inspectors, and track the
                operational pipeline without jumping between disconnected tools.
              </p>
            </div>
          </div>

          <div className="relative grid gap-4">
            {[
              'Agency scheduling and appointment operations',
              'Inspector allocation, confirmations and execution visibility',
              'Financial, reporting and audit trail in the same workspace',
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-4 backdrop-blur-sm"
              >
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/12 text-accent">
                  <i className="mdi mdi-check-bold text-base" aria-hidden="true" />
                </div>
                <p className="text-sm leading-6 text-white/88">{item}</p>
              </div>
            ))}
          </div>
          <p className="relative text-xs tracking-[0.14em] text-white/50">
            © Properfy. Internal use only.
          </p>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="inline-flex items-center gap-3">
                <img src="/images/properfy-icon-square.png" alt="" className="h-10 w-10 rounded-xl bg-white p-1 shadow-sm" />
                <div>
                  <p className="font-poppins text-lg font-semibold text-secondary">Properfy</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
                    Property Inspection Platform
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-black/8 bg-card-bg p-6 shadow-[0_20px_50px_rgba(33,86,110,0.08)] sm:p-8">
              <div className="mb-8">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-secondary/65">
                  Secure Sign In
                </p>
                <h2 className="mt-3 font-poppins text-3xl font-semibold tracking-tight text-secondary">
                  Welcome back
                </h2>
                <p className="mt-3 text-sm leading-6 text-text-secondary">
                  Use your company credentials to access the operational workspace.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-5 rounded-2xl border border-error/15 bg-error/5 px-4 py-3 text-sm leading-6 text-error"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div>
                  <label
                    htmlFor="login-email"
                    className="mb-2 block text-sm font-semibold text-text-secondary"
                  >
                    Work Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    autoFocus
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="mb-2 block text-sm font-semibold text-text-secondary"
                  >
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  />
                </div>

                {requiresTotp && (
                  <div>
                    <label
                      htmlFor="login-totp"
                      className="mb-2 block text-sm font-semibold text-text-secondary"
                    >
                      Authentication Code
                    </label>
                    <input
                      id="login-totp"
                      type="text"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      disabled={isSubmitting}
                      className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm tracking-[0.28em] text-text-primary outline-none transition placeholder:tracking-normal focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    />
                    <p className="mt-2 text-xs leading-5 text-text-muted">
                      Open your authenticator app and enter the current 6-digit code.
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-real-estate px-4 text-sm font-semibold text-white transition hover:brightness-95 active:brightness-90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {isSubmitting && (
                    <i className="mdi mdi-loading mdi-spin text-base" aria-hidden="true" />
                  )}
                  Sign In
                </button>
              </form>

              <div className="mt-4 text-center">
                <Link
                  to="/forgot-password"
                  className="text-sm font-semibold text-primary transition hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
                <p className="text-xs leading-5 text-text-secondary">
                  Need help? Contact your administrator for access, password resets or two-factor
                  support.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
