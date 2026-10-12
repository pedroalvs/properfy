import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form';
import { api } from '@/services/api';
import { ApiError, toApiError } from '@/lib/api-error';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many attempts. Please wait and try again.';
    if (error.status >= 500) return 'Server is temporarily unavailable. Try again shortly.';
    return error.message;
  }
  return 'Something went wrong. Check your connection and try again.';
}

export function ForgotPasswordPage() {
  const [error, setError] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = async (values: ForgotPasswordInput) => {
    setError('');
    try {
      const { error: apiError, response } = await api.POST('/v1/auth/forgot-password', {
        body: { email: values.email },
      });

      if (apiError) throw toApiError(apiError, (response as Response | undefined)?.status);

      setSubmittedEmail(values.email);
      setIsSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-col items-center px-6 pt-16 pb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary shadow-lg shadow-primary/25">
          <i className="mdi mdi-lock-reset text-[32px] text-white" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">Reset Password</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">Inspector Field App</p>
      </div>

      <div className="flex-1 px-5 pb-8">
        <div className="mx-auto w-full max-w-sm">
          {isSuccess ? (
            <div className="rounded-2xl border border-black/5 bg-white px-5 py-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10">
                <i className="mdi mdi-email-check-outline text-2xl text-success" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Check your email</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                If an account exists for{' '}
                <span className="font-semibold text-foreground">{submittedEmail}</span>, you will
                receive a password reset link shortly. Check your spam folder if it doesn't
                arrive within a few minutes.
              </p>
              <Link
                to="/login"
                className="mt-5 flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white shadow-lg shadow-primary/20 transition hover:brightness-95 active:brightness-90"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                noValidate
                className="space-y-4"
                data-testid="forgot-password-form"
              >
                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-destructive/15 bg-destructive/8 px-4 py-3 text-sm leading-relaxed text-destructive"
                  >
                    {error}
                  </div>
                )}

                <p className="text-sm leading-relaxed text-muted-foreground">
                  Enter the email you use to sign in and we'll send you a link to reset your
                  password.
                </p>

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
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  loading={isSubmitting}
                  className="!w-full !min-h-[50px] !rounded-2xl !shadow-lg !shadow-primary/20"
                >
                  Send Reset Link
                </Button>

                <div className="pt-2 text-center">
                  <Link
                    to="/login"
                    className="text-sm font-semibold text-primary transition hover:underline"
                  >
                    Back to Sign In
                  </Link>
                </div>
              </form>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}
