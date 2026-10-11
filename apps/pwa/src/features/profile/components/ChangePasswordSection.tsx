import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { changePasswordSchema, PASSWORD_REQUIREMENTS_MESSAGE } from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';
import { useChangePassword } from '../hooks/useChangePassword';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';

/**
 * Change-password form schema: reuses the shared {@link changePasswordSchema}
 * ({ currentPassword, newPassword }) and adds a confirm field, refining on the
 * extended object so the mismatch error lands on `confirmPassword`.
 */
const changePasswordFormSchema = changePasswordSchema
  .extend({ confirmPassword: z.string().min(1) })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

/** Pure display aid — maps a password to a strength bar. Not validation. */
function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (password.length < 8) return { score: 0, label: 'Too short', color: 'bg-gray-300' };
  let points = 0;
  if (/[a-z]/.test(password)) points++;
  if (/[A-Z]/.test(password)) points++;
  if (/\d/.test(password)) points++;
  if (/[^a-zA-Z\d]/.test(password)) points++;
  if (password.length >= 12) points++;
  if (points <= 1) return { score: 1, label: 'Weak', color: 'bg-error' };
  if (points === 2) return { score: 2, label: 'Fair', color: 'bg-warning' };
  if (points === 3) return { score: 3, label: 'Good', color: 'bg-info' };
  return { score: 4, label: 'Strong', color: 'bg-success' };
}

export function ChangePasswordSection() {
  const { changePassword, isSubmitting } = useChangePassword();
  const { logout } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPwd = form.watch('newPassword');
  const strength = getPasswordStrength(newPwd);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-sm"
      >
        <div className="flex items-center gap-3">
          <i className="mdi mdi-lock-outline text-xl text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">Change Password</span>
        </div>
        <i className="mdi mdi-chevron-right text-xl text-text-muted" />
      </button>
    );
  }

  const onSubmit = async (values: ChangePasswordFormValues) => {
    setError('');
    setSuccess(false);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      setSuccess(true);
      form.reset();
      setTimeout(() => {
        setExpanded(false);
        setSuccess(false);
        logout();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <i className="mdi mdi-lock-outline text-xl text-text-secondary" />
            <span className="text-sm font-semibold text-text-primary">Change Password</span>
          </div>
          <button type="button" onClick={() => setExpanded(false)} className="text-sm text-text-muted">Cancel</button>
        </div>

        <div className="mt-4 space-y-3">
          {error && <p role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}
          {success && <p className="rounded-xl bg-success/10 px-3 py-2 text-xs text-success">Password changed successfully. You will be asked to sign in again.</p>}

          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <PasswordInput
                    placeholder="Current password"
                    autoComplete="current-password"
                    disabled={form.formState.isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <PasswordInput
                    placeholder="New password"
                    autoComplete="new-password"
                    disabled={form.formState.isSubmitting}
                    {...field}
                  />
                </FormControl>
                {newPwd && (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 gap-1">
                      {[1, 2, 3, 4].map((l) => (
                        <div
                          key={l}
                          className={cn('h-1 flex-1 rounded-full', strength.score >= l ? strength.color : 'bg-black/10')}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] font-medium text-text-muted">{strength.label}</span>
                  </div>
                )}
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
                <FormControl>
                  <PasswordInput
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    disabled={form.formState.isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" loading={isSubmitting} className="!w-full !rounded-xl">
            Update Password
          </Button>
        </div>
      </form>
    </Form>
  );
}
