import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { passwordFieldSchema, mapResetPasswordError, PASSWORD_REQUIREMENTS_MESSAGE } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';

/**
 * Reset form schema: reuses the shared {@link passwordFieldSchema} for the new
 * password and refines on the extended object so the mismatch error lands on
 * `confirmPassword`. The token comes from the URL, not a form field.
 */
const resetFormSchema = z
  .object({
    newPassword: passwordFieldSchema,
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type ResetFormValues = z.infer<typeof resetFormSchema>;

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex flex-col items-center px-6 pt-16 pb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary shadow-lg shadow-primary/25">
          <i className="mdi mdi-lock-reset text-[32px] text-white" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-secondary">Reset Password</h1>
        <p className="mt-1 text-sm font-medium text-text-secondary">Inspector Field App</p>
      </div>
      <div className="flex-1 px-5 pb-8">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

function InvalidLinkState() {
  return (
    <div className="rounded-2xl border border-black/5 bg-white px-5 py-6 shadow-sm">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-error/10">
        <i className="mdi mdi-link-variant-off text-2xl text-error" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold text-secondary">Link not valid</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
        This reset link is invalid or has expired. Reset links are valid for 1 hour and can only
        be used once.
      </p>
      <Link
        to="/forgot-password"
        className="mt-5 flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-real-estate text-sm font-semibold text-white shadow-lg shadow-real-estate/20 transition hover:brightness-95 active:brightness-90"
      >
        Request a New Link
      </Link>
      <div className="mt-4 text-center">
        <Link to="/login" className="text-sm font-semibold text-primary transition hover:underline">
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [error, setError] = useState('');
  const [isInvalidToken, setIsInvalidToken] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });
  const isSubmitting = form.formState.isSubmitting;

  if (!token) {
    return (
      <PageShell>
        <InvalidLinkState />
      </PageShell>
    );
  }

  const onSubmit = async (values: ResetFormValues) => {
    setError('');
    setIsInvalidToken(false);

    try {
      const { error: apiError, response } = await api.POST('/v1/auth/reset-password', {
        body: { token, newPassword: values.newPassword },
      });

      if (apiError) throw toApiError(apiError, (response as Response | undefined)?.status);

      setIsSuccess(true);
    } catch (err) {
      const parsed = mapResetPasswordError(toApiError(err));
      setError(parsed.message);
      setIsInvalidToken(parsed.invalidToken);
    }
  };

  if (isSuccess) {
    return (
      <PageShell>
        <div className="rounded-2xl border border-black/5 bg-white px-5 py-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10">
            <i className="mdi mdi-lock-check-outline text-2xl text-success" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-secondary">Password updated</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Your password has been reset and all previous sessions were signed out. You can now
            sign in with your new password.
          </p>
          <Link
            to="/login"
            className="mt-5 flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-real-estate text-sm font-semibold text-white shadow-lg shadow-real-estate/20 transition hover:brightness-95 active:brightness-90"
          >
            Go to Sign In
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
          data-testid="reset-password-form"
        >
          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-error/15 bg-error/8 px-4 py-3 text-sm leading-relaxed text-error"
            >
              {error}
              {isInvalidToken && (
                <div className="mt-2">
                  <Link
                    to="/forgot-password"
                    className="font-semibold text-primary transition hover:underline"
                  >
                    Request a new link
                  </Link>
                </div>
              )}
            </div>
          )}

          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" disabled={isSubmitting} {...field} />
                </FormControl>
                <FormDescription>{PASSWORD_REQUIREMENTS_MESSAGE}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" disabled={isSubmitting} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            loading={isSubmitting}
            className="!w-full !min-h-[50px] !rounded-2xl !shadow-lg !shadow-real-estate/20"
          >
            Reset Password
          </Button>

          <div className="pt-2 text-center">
            <Link to="/login" className="text-sm font-semibold text-primary transition hover:underline">
              Back to Sign In
            </Link>
          </div>
        </form>
      </Form>
    </PageShell>
  );
}
