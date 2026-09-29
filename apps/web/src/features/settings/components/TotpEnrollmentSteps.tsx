import { useState, useCallback, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { Button } from '@/components/ui/Button';
import { SecretValue } from '@/components/ui/SecretValue';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { getErrorMessage } from '@/lib/api-error';
import { useTotpSetup } from '../hooks/useTotpSetup';
import { useTotpConfirm } from '../hooks/useTotpConfirm';
import type { TotpSetupData } from '../types';

interface TotpEnrollmentStepsProps {
  /** Called after the 6-digit code is confirmed and 2FA is enabled. */
  onEnrolled: () => void;
  onCancel: () => void;
}

/**
 * The scan-and-verify enrolment flow: provisions a fresh secret, renders its QR
 * and manual key, and confirms the first code. Shared by the settings 2FA dialog
 * (fresh enable and the re-enrol step of a reconfigure). Provisioning happens on
 * mount, so the parent must only render this once the account has no active
 * secret (a fresh account, or right after a disable).
 */
export function TotpEnrollmentSteps({ onEnrolled, onCancel }: TotpEnrollmentStepsProps) {
  const { setupTotp, isSettingUp } = useTotpSetup();
  const { confirmTotp, isConfirming } = useTotpConfirm();
  const [totpData, setTotpData] = useState<TotpSetupData | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  // Guards against StrictMode's double mount-effect provisioning twice.
  const provisionedRef = useRef(false);

  const provision = useCallback(() => {
    setSetupError(null);
    setupTotp()
      .then((data) => setTotpData(data))
      .catch((err) => setSetupError(getErrorMessage(err, 'Failed to start 2FA setup')));
  }, [setupTotp]);

  // Provision a secret once on mount.
  useEffect(() => {
    if (provisionedRef.current) return;
    provisionedRef.current = true;
    provision();
  }, [provision]);

  useEffect(() => {
    if (!totpData?.totpUri) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(totpData.totpUri, { width: 200, margin: 2 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => {
        if (cancelled) return;
        setQrDataUrl(null);
        console.error('Failed to generate TOTP QR code', err);
      });
    return () => {
      cancelled = true;
    };
  }, [totpData?.totpUri]);

  const handleConfirm = useCallback(async () => {
    if (totpCode.length !== 6) {
      setCodeError('Enter a 6-digit code');
      return;
    }
    const result = await confirmTotp(totpCode);
    if (result.success) {
      onEnrolled();
    } else {
      setCodeError(result.error ?? 'Invalid code');
    }
  }, [totpCode, confirmTotp, onEnrolled]);

  if (setupError && !totpData) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorState message={setupError} onRetry={provision} />
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (!totpData) {
    return <LoadingState rows={4} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        Scan the QR code with your authenticator app, or enter the key manually. Then enter the
        6-digit code it shows to finish.
      </p>
      {qrDataUrl && (
        <div className="flex flex-col items-center gap-2">
          <img src={qrDataUrl} alt="Scan with authenticator app" className="rounded" data-testid="totp-qr" />
        </div>
      )}
      <div className="rounded border border-black/10 bg-app-bg p-3">
        <p className="mb-1 text-xs text-text-muted">Setup key</p>
        <span data-testid="totp-secret">
          <SecretValue value={totpData.secret} label="setup key" />
        </span>
      </div>
      <FormField label="Verification code" required error={codeError}>
        <TextInput
          value={totpCode}
          onChange={(v) => {
            setTotpCode(v.replace(/\D/g, '').slice(0, 6));
            setCodeError('');
          }}
          placeholder="000000"
          error={!!codeError}
          aria-label="Verification code"
        />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={isConfirming}>
          Cancel
        </Button>
        <Button variant="primary" loading={isConfirming || isSettingUp} onClick={handleConfirm}>
          Confirm
        </Button>
      </div>
    </div>
  );
}
