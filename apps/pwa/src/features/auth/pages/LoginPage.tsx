import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';

export function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (authLoading) return null;
  if (isAuthenticated) return <Navigate to="/schedule" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch {
      setError('Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-page-x">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <h1 className="text-page-title text-secondary">Properfy</h1>
          <p className="mt-1 text-sm text-text-secondary">Inspector Login</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4" data-testid="login-form">
          {error && (
            <div role="alert" className="rounded bg-error/10 px-4 py-2 text-sm text-error" data-testid="login-error">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-text-secondary">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-12 w-full rounded border border-border-subtle bg-card-bg px-3 text-sm text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              data-testid="email-input"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-text-secondary">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="h-12 w-full rounded border border-border-subtle bg-card-bg px-3 text-sm text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              data-testid="password-input"
            />
          </div>

          <Button
            type="submit"
            loading={isSubmitting}
            className="!w-full !min-h-[48px]"
            data-testid="login-button"
          >
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}
