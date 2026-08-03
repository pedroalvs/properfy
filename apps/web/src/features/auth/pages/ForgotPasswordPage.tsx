import { useState, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useForgotPassword } from '../hooks/useForgotPassword';
import { AuthLayout } from '../components/AuthLayout';
import { AuthField } from '../components/AuthField';
import { AuthAlert } from '../components/AuthAlert';
import { AuthSubmitButton } from '../components/AuthSubmitButton';

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

  if (isSuccess) {
    return (
      <AuthLayout title="Check your email" subtitle="A reset link is on its way.">
        <p className="text-sm leading-6 text-text-secondary">
          If an account exists for{' '}
          <span className="font-bold text-text-primary">{email.trim()}</span>, you will receive a
          password reset link shortly. Check your spam folder if it doesn&apos;t arrive within a few
          minutes.
        </p>
        <div className="mt-8">
          <Link
            to="/login"
            className="inline-flex h-11 items-center justify-center rounded bg-real-estate px-7 text-sm font-bold text-white transition hover:brightness-95 active:brightness-90"
          >
            Back to Sign In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot password?" subtitle="We'll email you a reset link.">
      {displayError && <AuthAlert>{displayError}</AuthAlert>}

      <form onSubmit={handleSubmit} noValidate>
        <AuthField
          id="forgot-email"
          label="Work Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          disabled={isLoading}
          hint="Enter the address you use to sign in."
        />

        <div className="mt-7 flex items-center justify-between gap-4">
          <Link to="/login" className="text-sm font-bold text-primary transition hover:underline">
            Back to Sign In
          </Link>
          <AuthSubmitButton loading={isLoading}>Send Reset Link</AuthSubmitButton>
        </div>
      </form>
    </AuthLayout>
  );
}
