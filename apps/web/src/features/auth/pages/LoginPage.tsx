import { useState, useCallback, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ApiError, getErrorMessage } from '@/lib/api-error';
import { consumePostLoginRedirect } from '@/lib/post-login-redirect';
import { AuthLayout } from '../components/AuthLayout';
import { AuthField } from '../components/AuthField';
import { AuthPasswordField } from '../components/AuthPasswordField';
import { AuthAlert } from '../components/AuthAlert';
import { AuthSubmitButton } from '../components/AuthSubmitButton';
import { AuthTextLink } from '../components/AuthTextLink';

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
    <AuthLayout title="We are Properfy" subtitle="Welcome. Please log in.">
      {error && <AuthAlert>{error}</AuthAlert>}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <AuthField
          id="login-email"
          label="Work Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          disabled={isSubmitting}
        />

        <AuthPasswordField
          id="login-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={isSubmitting}
        />

        {requiresTotp && (
          <AuthField
            id="login-totp"
            label="Authentication Code"
            type="text"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={isSubmitting}
            hint="Open your authenticator app and enter the current 6-digit code."
          />
        )}

        <div className="flex items-center justify-between gap-4 pt-2">
          <AuthTextLink to="/forgot-password">Forgot your password?</AuthTextLink>
          <AuthSubmitButton loading={isSubmitting}>Sign In</AuthSubmitButton>
        </div>
      </form>
    </AuthLayout>
  );
}
