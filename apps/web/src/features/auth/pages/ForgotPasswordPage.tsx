import { useState, useCallback, type FormEvent } from 'react';
import { useForgotPassword } from '../hooks/useForgotPassword';
import { AuthLayout } from '../components/AuthLayout';
import { AuthField } from '../components/AuthField';
import { AuthAlert } from '../components/AuthAlert';
import { AuthSubmitButton } from '../components/AuthSubmitButton';
import { AuthLinkButton } from '../components/AuthLinkButton';
import { AuthTextLink } from '../components/AuthTextLink';

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
          <AuthLinkButton to="/login">Back to Sign In</AuthLinkButton>
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
          <AuthTextLink to="/login">Back to Sign In</AuthTextLink>
          <AuthSubmitButton loading={isLoading}>Send Reset Link</AuthSubmitButton>
        </div>
      </form>
    </AuthLayout>
  );
}
