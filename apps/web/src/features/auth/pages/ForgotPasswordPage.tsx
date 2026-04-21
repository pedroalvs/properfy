import { useState, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useForgotPassword } from '../hooks/useForgotPassword';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const { requestReset, isLoading, isSuccess, error } = useForgotPassword();

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setValidationError(null);

      const trimmed = email.trim();
      if (!trimmed) {
        setValidationError('Please enter your email address.');
        return;
      }
      if (!isValidEmail(trimmed)) {
        setValidationError('Please enter a valid email address.');
        return;
      }

      await requestReset(trimmed);
    },
    [email, requestReset],
  );

  const displayError = validationError ?? error;

  return (
    <div className="min-h-screen bg-app-bg">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <section className="relative hidden overflow-hidden bg-secondary px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(65,166,157,0.28),transparent_28%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/8 px-4 py-2 backdrop-blur-sm">
              <img src="/favicon.png" alt="" className="h-8 w-8 rounded-lg bg-white/90 p-1" />
              <div>
                <p className="font-poppins text-base font-semibold leading-tight">Properfy</p>
                <p className="text-xs uppercase tracking-[0.18em] text-white/70">
                  Property Inspection Platform
                </p>
              </div>
            </div>

            <div className="mt-16 max-w-xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/70">
                Account Recovery
              </p>
              <h1 className="mt-5 font-poppins text-4xl font-semibold leading-tight">
                Reset your password and get back to managing your inspections.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/78">
                Enter your work email and we will send you a link to reset your password. The link
                is valid for a limited time.
              </p>
            </div>
          </div>

          <div className="relative grid gap-4">
            {[
              'Secure link sent to your work email',
              'Link expires automatically for your protection',
              'Contact your administrator if you no longer have email access',
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
                <img src="/favicon.png" alt="" className="h-10 w-10 rounded-xl bg-white p-1 shadow-sm" />
                <div>
                  <p className="font-poppins text-lg font-semibold text-secondary">Properfy</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
                    Property Inspection Platform
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-black/8 bg-card-bg p-6 shadow-[0_20px_50px_rgba(33,86,110,0.08)] sm:p-8">
              {isSuccess ? (
                <div>
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
                    <i className="mdi mdi-email-check-outline text-2xl text-success" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-secondary/65">
                    Email Sent
                  </p>
                  <h2 className="mt-3 font-poppins text-3xl font-semibold tracking-tight text-secondary">
                    Check your email
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-text-secondary">
                    If an account exists for <span className="font-semibold text-text-primary">{email.trim()}</span>,
                    you will receive a password reset link shortly. Check your spam folder if it
                    doesn't arrive within a few minutes.
                  </p>
                  <div className="mt-6">
                    <Link
                      to="/login"
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-real-estate px-4 text-sm font-semibold text-white transition hover:brightness-95 active:brightness-90"
                    >
                      Back to Sign In
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-8">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-secondary/65">
                      Password Reset
                    </p>
                    <h2 className="mt-3 font-poppins text-3xl font-semibold tracking-tight text-secondary">
                      Forgot password?
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-text-secondary">
                      Enter your work email address and we'll send you a link to reset your
                      password.
                    </p>
                  </div>

                  {displayError && (
                    <div
                      role="alert"
                      className="mb-5 rounded-2xl border border-error/15 bg-error/5 px-4 py-3 text-sm leading-6 text-error"
                    >
                      {displayError}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    <div>
                      <label
                        htmlFor="forgot-email"
                        className="mb-2 block text-sm font-semibold text-text-secondary"
                      >
                        Work Email
                      </label>
                      <input
                        id="forgot-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        autoComplete="email"
                        autoFocus
                        disabled={isLoading}
                        className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-real-estate px-4 text-sm font-semibold text-white transition hover:brightness-95 active:brightness-90 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {isLoading && (
                        <i className="mdi mdi-loading mdi-spin text-base" aria-hidden="true" />
                      )}
                      Send Reset Link
                    </button>
                  </form>

                  <div className="mt-6 text-center">
                    <Link
                      to="/login"
                      className="text-sm font-semibold text-primary transition hover:underline"
                    >
                      Back to Sign In
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
