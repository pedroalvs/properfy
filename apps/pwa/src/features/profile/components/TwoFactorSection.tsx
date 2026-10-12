import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTotpSetup } from '../hooks/useTotpSetup';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/Form';

interface TwoFactorSectionProps {
  enabled: boolean;
  onEnabled: () => void;
}

const confirmCodeSchema = z.object({
  code: z.string().length(6, 'Enter the 6-digit code'),
});
type ConfirmCodeValues = z.infer<typeof confirmCodeSchema>;

export function TwoFactorSection({ enabled, onEnabled }: TwoFactorSectionProps) {
  const { setupData, startSetup, confirmSetup, cancelSetup, isSettingUp, isConfirming } = useTotpSetup();
  const [error, setError] = useState('');

  const form = useForm<ConfirmCodeValues>({
    resolver: zodResolver(confirmCodeSchema),
    defaultValues: { code: '' },
  });

  if (enabled && !setupData) {
    return (
      <div className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <i className="mdi mdi-shield-check-outline text-xl text-success" />
          <div>
            <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
            <p className="text-xs text-success">Enabled</p>
          </div>
        </div>
        <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">Active</span>
      </div>
    );
  }

  if (!setupData) {
    return (
      <div className="rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <i className="mdi mdi-shield-alert-outline text-xl text-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
            <p className="text-xs text-warning">Not enabled — your account is less secure</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={startSetup}
          loading={isSettingUp}
          className="!mt-3 !w-full !rounded-xl"
        >
          Enable 2FA
        </Button>
      </div>
    );
  }

  const onSubmit = async (values: ConfirmCodeValues) => {
    setError('');
    try {
      await confirmSetup(values.code);
      onEnabled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <i className="mdi mdi-shield-lock-outline text-xl text-primary" />
            <span className="text-sm font-semibold text-foreground">Set Up 2FA</span>
          </div>
          <button type="button" onClick={cancelSetup} className="text-sm text-muted-foreground">Cancel</button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-primary/5 p-3">
            <p className="text-xs font-medium text-muted-foreground">1. Open your authenticator app (Google Authenticator, Authy, etc.)</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">2. Add a new account using this setup key:</p>
            <p className="mt-2 select-all break-all rounded-lg bg-card px-3 py-2 font-mono text-xs text-foreground">{setupData.secret}</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">3. Enter the 6-digit code from the app:</p>
            {error && <p role="alert" className="mb-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      autoComplete="one-time-code"
                      disabled={form.formState.isSubmitting}
                      className="h-12 text-center font-mono text-lg tracking-[0.3em]"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button type="submit" loading={isConfirming} className="!w-full !rounded-xl">
            Verify &amp; Enable
          </Button>
        </div>
      </form>
    </Form>
  );
}
