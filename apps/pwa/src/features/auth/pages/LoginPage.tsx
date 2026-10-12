import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { loginSchema, UserRole } from '@properfy/shared';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form';
import { ApiError } from '@/lib/api-error';
import { consumePostLoginRedirect } from '@/lib/post-login-redirect';

/**
 * Login form schema. Reuses the shared {@link loginSchema} and loosens `totpCode`
 * so the first credential-only submit is valid; the 6-digit requirement is
 * enforced manually once the TOTP step is active. The email and password fields
 * get friendly presence copy here (the shared schema's defaults are generic zod
 * strings): an empty email reads as required ("Enter your email") and mirrors the
 * password field, while a non-empty malformed email still shows a format message.
 * The email transform (lowercase + trim) is reproduced to match the shared schema.
 */
const loginFormSchema = loginSchema.extend({
  email: z
    .string()
    .min(1, 'Enter your email')
    .email('Enter a valid email address')
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, 'Enter your password').max(128),
  totpCode: z.string().optional(),
});
type LoginFormValues = z.infer<typeof loginFormSchema>;

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
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError] = useState('');

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '', totpCode: '' },
  });
  const isSubmitting = form.formState.isSubmitting;

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
        <p className="mt-4 text-sm text-muted-foreground">Restoring session...</p>
      </div>
    );
  }
  if (isAuthenticated && user?.role === UserRole.INSP) return null;

  const onSubmit = async (values: LoginFormValues) => {
    setError('');

    const code = (values.totpCode ?? '').trim();
    if (requiresTotp && code.length !== 6) {
      form.setError('totpCode', {
        message: 'Enter the 6-digit code from your authenticator app.',
      });
      return;
    }

    try {
      await login(values.email, values.password, requiresTotp ? code : undefined);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'AUTH_TOTP_REQUIRED') {
        setRequiresTotp(true);
      }
      setError(getErrorMessage(err));
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
        <p className="mt-1 text-sm font-medium text-muted-foreground">Inspector Field App</p>
      </div>

      {/* Form card */}
      <div className="flex-1 px-5 pb-8">
        <div className="mx-auto w-full max-w-sm">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
              data-testid="login-form"
              noValidate
            >
              {error && (
                <div
                  role="alert"
                  className="rounded-2xl border border-destructive/15 bg-destructive/8 px-4 py-3 text-sm leading-relaxed text-destructive"
                  data-testid="login-error"
                >
                  {error}
                </div>
              )}

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="your@email.com"
                        disabled={isSubmitting}
                        data-testid="email-input"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <PasswordInput
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        disabled={isSubmitting}
                        data-testid="password-input"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {requiresTotp && (
                <FormField
                  control={form.control}
                  name="totpCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authentication Code</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          autoComplete="one-time-code"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="123456"
                          className="tracking-[0.3em] placeholder:tracking-normal"
                          disabled={isSubmitting}
                          data-testid="totp-input"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(e.target.value.replace(/\D/g, '').slice(0, 6))
                          }
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Open your authenticator app and enter the current 6-digit code.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <Button
                type="submit"
                loading={isSubmitting}
                className="!w-full !min-h-[50px] !rounded-2xl !shadow-lg !shadow-primary/20"
                data-testid="login-button"
              >
                Sign In
              </Button>
            </form>
          </Form>

          {/* Context */}
          <div className="mt-6 rounded-2xl border border-primary/8 bg-primary/4 px-4 py-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold">Inspector access only.</span>{' '}
              Your schedule, offers and inspections are available here. Agency and admin users should use the{' '}
              <span className="font-medium text-primary">web portal</span>.
            </p>
          </div>

          <div className="mt-6 text-center">
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-primary transition hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Can't sign in? Contact your operations team for access.
          </p>
        </div>
      </div>
    </div>
  );
}
