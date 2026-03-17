import { useState, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api-client';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'AUTH_INVALID_CREDENTIALS':
        return 'Invalid email or password.';
      case 'AUTH_ACCOUNT_LOCKED':
        return 'Account locked. Please try again later.';
      case 'AUTH_USER_INACTIVE':
        return 'Account is inactive. Contact your administrator.';
      default:
        break;
    }
    if (error.status === 429) return 'Too many attempts. Please wait and try again.';
    if (error.status >= 500) return 'Server error. Please try again later.';
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!email.trim() || !password) {
        setError('Please enter your email and password.');
        return;
      }

      setIsLoading(true);
      try {
        await login(email.trim(), password);
        navigate('/', { replace: true });
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, login, navigate],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg">
      <div className="w-full max-w-sm rounded bg-card-bg p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-secondary">
          Properfy
        </h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label
              htmlFor="login-email"
              className="mb-1 block text-sm font-medium text-text-secondary"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              disabled={isLoading}
              className="w-full rounded border border-black/20 bg-white px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="login-password"
              className="mb-1 block text-sm font-medium text-text-secondary"
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
              disabled={isLoading}
              className="w-full rounded border border-black/20 bg-white px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded border border-error/20 bg-error/5 px-3 py-2 text-sm text-error"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded bg-real-estate py-2.5 text-sm font-semibold text-white transition hover:brightness-95 active:brightness-90 disabled:pointer-events-none disabled:opacity-50"
          >
            {isLoading && (
              <i className="mdi mdi-loading mdi-spin text-base" aria-hidden="true" />
            )}
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
