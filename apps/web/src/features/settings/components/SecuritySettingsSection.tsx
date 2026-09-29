import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { TwoFactorDialog } from './TwoFactorDialog';
import { SessionTable } from './SessionTable';

/**
 * The account "Security" tab: password, two-factor authentication and active
 * sessions. Password and 2FA are managed through modals so the page stays a
 * scannable overview.
 */
export function SecuritySettingsSection() {
  const { user } = useAuth();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);
  const isTotpEnabled = user?.totpEnabled === true;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded bg-card-bg p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-secondary">Password</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Change the password you use to sign in. You&apos;ll be asked to sign in again
              afterwards.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setPasswordOpen(true)}>
            Change password
          </Button>
        </div>
      </div>

      <div className="rounded bg-card-bg p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-secondary">Two-factor authentication</h3>
            <p className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
              <span
                className={`inline-block h-2 w-2 rounded-full ${isTotpEnabled ? 'bg-success' : 'bg-text-muted'}`}
                aria-hidden="true"
              />
              {isTotpEnabled ? 'Enabled' : 'Not enabled'}
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              {isTotpEnabled
                ? 'Reconfigure to switch authenticator apps, or turn it off.'
                : 'Add a 6-digit code from an authenticator app on top of your password.'}
            </p>
          </div>
          <Button variant="primary" onClick={() => setTwoFactorOpen(true)}>
            {isTotpEnabled ? 'Manage' : 'Set up'}
          </Button>
        </div>
      </div>

      <SessionTable />

      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <TwoFactorDialog open={twoFactorOpen} onClose={() => setTwoFactorOpen(false)} />
    </div>
  );
}
