import { useState, useCallback, useEffect } from 'react';
import QRCode from 'qrcode';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { Button } from '@/components/ui/Button';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/lib/api-error';
import { useTotpSetup } from '../hooks/useTotpSetup';
import { useTotpConfirm } from '../hooks/useTotpConfirm';
import type { TotpSetupData } from '../types';

export function TotpSetupCard() {
  const { user } = useAuth();
  const { setupTotp, isSettingUp } = useTotpSetup();
  const { confirmTotp, isConfirming } = useTotpConfirm();
  const { showSuccess, showError } = useSnackbar();
  const [totpData, setTotpData] = useState<TotpSetupData | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [enabledInSession, setEnabledInSession] = useState(false);
  const isTotpEnabled = user?.totpEnabled === true || enabledInSession;

  useEffect(() => {
    if (totpData?.totpUri) {
      QRCode.toDataURL(totpData.totpUri, { width: 200, margin: 2 }).then(setQrDataUrl);
    } else {
      setQrDataUrl(null);
    }
  }, [totpData?.totpUri]);

  const handleSetup = useCallback(async () => {
    try {
      const data = await setupTotp();
      setTotpData(data);
      setTotpCode('');
      setCodeError('');
    } catch (err) {
      showError(getErrorMessage(err, 'Failed to initialize 2FA setup'));
    }
  }, [setupTotp, showError]);

  const handleConfirm = useCallback(async () => {
    if (!totpCode.trim() || totpCode.length !== 6) {
      setCodeError('Enter a 6-digit code');
      return;
    }

    const result = await confirmTotp(totpCode);
    if (result.success) {
      showSuccess('Two-factor authentication enabled successfully');
      setTotpData(null);
      setTotpCode('');
      setCodeError('');
      setEnabledInSession(true);
    } else {
      showError(result.error ?? 'Invalid code');
    }
  }, [totpCode, confirmTotp, showSuccess, showError]);

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-secondary">Two-Factor Authentication</h3>

      {isTotpEnabled ? (
        <div className="rounded border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">
            Two-factor authentication is enabled for this account.
          </p>
          <p className="mt-1 text-sm text-green-700">
            Use the 6-digit code from your authenticator app when prompted during login.
          </p>
        </div>
      ) : !totpData ? (
        <div>
          <p className="mb-4 text-sm text-text-secondary">
            Add an extra layer of security to your account by enabling two-factor authentication.
          </p>
          <Button variant="primary" loading={isSettingUp} onClick={handleSetup}>
            Setup 2FA
          </Button>
        </div>
      ) : (
        <div className="flex max-w-md flex-col gap-4">
          <p className="text-sm text-text-secondary">
            Scan the QR code with your authenticator app, or enter the secret manually.
          </p>
          {qrDataUrl && (
            <div className="flex flex-col items-center gap-2">
              <img src={qrDataUrl} alt="Scan with authenticator app" className="rounded" data-testid="totp-qr" />
              <p className="text-xs text-text-muted">Scan this QR code with your authenticator app</p>
            </div>
          )}
          <div className="rounded border border-black/10 bg-app-bg p-3">
            <p className="break-all text-xs font-mono text-text-secondary" data-testid="totp-uri">
              {totpData.totpUri}
            </p>
          </div>
          <div className="rounded border border-black/10 bg-app-bg p-3">
            <p className="text-xs text-text-muted">Secret:</p>
            <p className="break-all text-sm font-mono font-semibold" data-testid="totp-secret">
              {totpData.secret}
            </p>
          </div>
          <FormField label="Confirmation Code" required error={codeError}>
            <TextInput
              value={totpCode}
              onChange={(v) => {
                setTotpCode(v.replace(/\D/g, '').slice(0, 6));
                setCodeError('');
              }}
              placeholder="000000"
              error={!!codeError}
              aria-label="Confirmation Code"
            />
          </FormField>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setTotpData(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={isConfirming} onClick={handleConfirm}>
              Confirm
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
