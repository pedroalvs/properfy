import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link2Off, ShieldCheck } from 'lucide-react';
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
import { AuthHeroLayout } from '../components/AuthHeroLayout';

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

function InvalidLinkState() {
  return (
    <AuthHeroLayout title="Link not valid" subtitle="This reset link can't be used.">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
        <Link2Off size={24} className="text-destructive" aria-hidden="true" />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        This reset link is invalid or has expired. Reset links are valid for 1 hour and can only
        be used once.
      </p>
      <Link
        to="/forgot-password"
        className="mt-5 flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white shadow-lg shadow-primary/20 transition hover:brightness-95 active:brightness-90"
      >
        Request a New Link
      </Link>
      <div className="mt-4 text-center">
        <Link
          to="/login"
          className="inline-flex min-h-touch items-center justify-center px-3 text-sm font-semibold text-primary transition hover:underline"
        >
          Back to Sign In
        </Link>
      </div>
    </AuthHeroLayout>
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
    return <InvalidLinkState />;
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
      <AuthHeroLayout title="Password updated" subtitle="You're all set.">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10">
          <ShieldCheck size={24} className="text-success" aria-hidden="true" />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your password has been reset and all previous sessions were signed out. You can now sign
          in with your new password.
        </p>
        <Link
          to="/login"
          className="mt-5 flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white shadow-lg shadow-primary/20 transition hover:brightness-95 active:brightness-90"
        >
          Go to Sign In
        </Link>
      </AuthHeroLayout>
    );
  }

  return (
    <AuthHeroLayout title="Reset password" subtitle="Choose a new password.">
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
              className="rounded-2xl border border-destructive/15 bg-destructive/8 px-4 py-3 text-sm leading-relaxed text-destructive"
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
            className="!w-full !min-h-[50px] !rounded-2xl !shadow-lg !shadow-primary/20"
          >
            Reset Password
          </Button>

          <div className="pt-2 text-center">
            <Link
              to="/login"
              className="inline-flex min-h-touch items-center justify-center px-3 text-sm font-semibold text-primary transition hover:underline"
            >
              Back to Sign In
            </Link>
          </div>
        </form>
      </Form>
    </AuthHeroLayout>
  );
}
