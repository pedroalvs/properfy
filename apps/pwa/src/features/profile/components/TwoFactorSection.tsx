import { useState, type FormEvent } from 'react';
import { useTotpSetup } from '../hooks/useTotpSetup';
import { Button } from '@/components/ui/Button';

interface TwoFactorSectionProps {
  enabled: boolean;
  onEnabled: () => void;
}

export function TwoFactorSection({ enabled, onEnabled }: TwoFactorSectionProps) {
  const { setupData, startSetup, confirmSetup, cancelSetup, isSettingUp, isConfirming } = useTotpSetup();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  if (enabled && !setupData) {
    return (
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <i className="mdi mdi-shield-check-outline text-xl text-success" />
          <div>
            <p className="text-sm font-medium text-text-primary">Two-Factor Authentication</p>
            <p className="text-xs text-success">Enabled</p>
          </div>
        </div>
        <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">Active</span>
      </div>
    );
  }

  if (!setupData) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <i className="mdi mdi-shield-alert-outline text-xl text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">Two-Factor Authentication</p>
            <p className="text-xs text-amber-600">Not enabled — your account is less secure</p>
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

  const handleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (code.length !== 6) { setError('Enter the 6-digit code'); return; }
    try {
      await confirmSetup(code);
      onEnabled();
    } catch (err: any) {
      setError(err.message ?? 'Invalid code');
    }
  };

  return (
    <form onSubmit={handleConfirm} className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <i className="mdi mdi-shield-lock-outline text-xl text-primary" />
          <span className="text-sm font-semibold text-text-primary">Set Up 2FA</span>
        </div>
        <button type="button" onClick={cancelSetup} className="text-sm text-text-muted">Cancel</button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-xl bg-primary/5 p-3">
          <p className="text-xs font-medium text-text-secondary">1. Open your authenticator app (Google Authenticator, Authy, etc.)</p>
          <p className="mt-1 text-xs font-medium text-text-secondary">2. Add a new account using this setup key:</p>
          <p className="mt-2 select-all break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-text-primary">{setupData.secret}</p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-text-secondary">3. Enter the 6-digit code from the app:</p>
          {error && <p className="mb-2 rounded-xl bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="one-time-code"
            className="h-12 w-full rounded-xl border border-black/10 bg-app-bg/60 px-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <Button type="submit" loading={isConfirming} className="!w-full !rounded-xl">
          Verify &amp; Enable
        </Button>
      </div>
    </form>
  );
}
