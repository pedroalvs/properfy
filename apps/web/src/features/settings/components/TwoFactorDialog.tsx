import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { useAuth } from '@/hooks/useAuth';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useDisableTotp } from '../hooks/useDisableTotp';
import { TotpEnrollmentSteps } from './TotpEnrollmentSteps';

interface TwoFactorDialogProps {
  open: boolean;
  onClose: () => void;
}

type View = 'manage' | 'password' | 'enroll';
type Intent = 'disable' | 'reconfigure';

/**
 * Self-service 2FA management. When 2FA is off, the dialog opens straight into
 * enrolment. When it is on, it offers "Reconfigure" (swap authenticator) and,
 * for non-AM roles, "Turn off" — both re-authenticate with the current password
 * before disabling. AM accounts cannot fully turn 2FA off (it is mandatory), so
 * only Reconfigure is shown; the reset still forces re-enrolment at next login.
 */
export function TwoFactorDialog({ open, onClose }: TwoFactorDialogProps) {
  const { user, refreshUser } = useAuth();
  const { disableTotp, isDisabling } = useDisableTotp();
  const { showSuccess } = useSnackbar();
  const isEnabled = user?.totpEnabled === true;
  const isAm = user?.role === 'AM';

  const [view, setView] = useState<View>('manage');
  const [intent, setIntent] = useState<Intent>('reconfigure');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  // Tracks a disable that landed server-side but hasn't been reflected in the
  // auth state yet — so closing mid-reconfigure still refreshes the stale
  // "Enabled" card instead of leaving it lying.
  const disabledPendingRefresh = useRef(false);

  // Reset to the right entry view each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setView(isEnabled ? 'manage' : 'enroll');
    setIntent('reconfigure');
    setPassword('');
    setPasswordError('');
    disabledPendingRefresh.current = false;
  }, [open, isEnabled]);

  const finish = useCallback(
    async (message: string) => {
      disabledPendingRefresh.current = false;
      await refreshUser();
      showSuccess(message);
      onClose();
    },
    [refreshUser, showSuccess, onClose],
  );

  // Any close path (backdrop, Escape, Cancel) must reconcile the card when a
  // disable happened but enrolment wasn't completed.
  const handleClose = useCallback(() => {
    if (disabledPendingRefresh.current) {
      disabledPendingRefresh.current = false;
      void refreshUser();
    }
    onClose();
  }, [refreshUser, onClose]);

  const startIntent = useCallback((next: Intent) => {
    setIntent(next);
    setPassword('');
    setPasswordError('');
    setView('password');
  }, []);

  const handleDisableSubmit = useCallback(async () => {
    if (!password.trim()) {
      setPasswordError('Enter your current password');
      return;
    }
    const result = await disableTotp(password);
    if (!result.success) {
      setPasswordError(result.error ?? 'Failed to disable two-factor authentication');
      return;
    }
    // 2FA is now off server-side; if the user bails before re-enrolling, the card
    // must refresh so it doesn't keep claiming "Enabled".
    disabledPendingRefresh.current = true;
    if (intent === 'reconfigure') {
      // Secret cleared server-side; enrolment can now provision a fresh one.
      setView('enroll');
      return;
    }
    await finish('Two-factor authentication turned off.');
  }, [password, disableTotp, intent, finish]);

  const handleEnrolled = useCallback(() => {
    // `isEnabled` still reflects the pre-open state (auth refreshes only in
    // finish), so it distinguishes a first-time enable from a reconfigure.
    void finish(
      isEnabled
        ? 'Two-factor authentication updated with your new authenticator.'
        : 'Two-factor authentication enabled.',
    );
  }, [finish, isEnabled]);

  const title = view === 'enroll' && isEnabled ? 'Reconfigure two-factor authentication' : 'Two-factor authentication';

  return (
    <Dialog open={open} onClose={handleClose} title={title}>
      {view === 'manage' && (
        <div className="flex flex-col gap-4">
          <div className="rounded border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">
              Two-factor authentication is enabled for this account.
            </p>
            <p className="mt-1 text-sm text-green-700">
              You enter a 6-digit code from your authenticator app when signing in.
            </p>
          </div>
          <p className="text-sm text-text-secondary">
            Lost or changing your device? Reconfigure to register a new authenticator — the old
            one stops working once the new one is confirmed.
          </p>
          {isAm && (
            <p className="text-sm text-text-muted">
              Two-factor authentication is required for admin accounts, so it can be reconfigured
              but not turned off.
            </p>
          )}
          <div className="flex justify-end gap-2">
            {!isAm && (
              <Button variant="secondary" onClick={() => startIntent('disable')} disabled={isDisabling}>
                Turn off
              </Button>
            )}
            <Button variant="primary" onClick={() => startIntent('reconfigure')} disabled={isDisabling}>
              Reconfigure
            </Button>
          </div>
        </div>
      )}

      {view === 'password' && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleDisableSubmit();
          }}
        >
          <p className="text-sm text-text-secondary">
            {intent === 'reconfigure'
              ? 'Confirm your current password to remove the current authenticator and set up a new one.'
              : 'Confirm your current password to turn off two-factor authentication.'}
          </p>
          <FormField label="Current password" required error={passwordError}>
            <TextInput
              type="password"
              value={password}
              onChange={(v) => {
                setPassword(v);
                setPasswordError('');
              }}
              placeholder="Enter current password"
              error={!!passwordError}
              aria-label="Current password"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setView(isEnabled ? 'manage' : 'enroll')}
              disabled={isDisabling}
            >
              Back
            </Button>
            <Button type="submit" variant="primary" loading={isDisabling}>
              {intent === 'reconfigure' ? 'Continue' : 'Turn off'}
            </Button>
          </div>
        </form>
      )}

      {view === 'enroll' && (
        <TotpEnrollmentSteps onEnrolled={handleEnrolled} onCancel={handleClose} />
      )}
    </Dialog>
  );
}
