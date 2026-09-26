import { useState, useEffect, useCallback, useRef, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuth, type TotpSetupData } from '@/hooks/useAuth';
import { consumePostLoginRedirect } from '@/lib/post-login-redirect';
import { ApiError, getErrorMessage } from '@/lib/api-error';
import { useTotpSetup } from '@/features/settings/hooks/useTotpSetup';
import { useTotpConfirm } from '@/features/settings/hooks/useTotpConfirm';
import { shouldSuggestTotp, snoozeTotpSuggestion } from '../lib/totp-suggestion';
import { AuthLayout } from '../components/AuthLayout';
import { AuthField } from '../components/AuthField';
import { AuthAlert } from '../components/AuthAlert';
import { AuthSubmitButton } from '../components/AuthSubmitButton';
import { AuthTextLink } from '../components/AuthTextLink';

type Mode = 'mandatory' | 'optional';

function ProgressDots({ step }: { step: 'scan' | 'verify' }) {
  return (
    <div className="mb-6 flex items-center gap-2" aria-hidden="true">
      <span className="h-2.5 w-2.5 rounded-full bg-real-estate" />
      <span className="h-px w-8 bg-border-subtle" />
      <span
        className={`h-2.5 w-2.5 rounded-full ${step === 'verify' ? 'bg-real-estate' : 'bg-border-subtle'}`}
      />
    </div>
  );
}

function TotpQr({ qrDataUrl }: { qrDataUrl: string | null }) {
  if (!qrDataUrl) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={qrDataUrl}
        alt="Scan with your authenticator app"
        className="rounded border border-black/10"
        data-testid="totp-qr"
      />
      <p className="text-xs text-text-muted">Scan this with Google Authenticator, Authy, 1Password…</p>
    </div>
  );
}

function TotpSecret({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the key is visible for manual entry regardless.
    }
  }, [secret]);

  return (
    <div className="rounded border border-black/10 bg-app-bg p-3">
      <p className="text-xs text-text-muted">Can&apos;t scan? Enter this key manually:</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="break-all font-mono text-sm font-semibold text-text-primary" data-testid="totp-secret">
          {secret}
        </p>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded text-xs font-bold text-primary transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/**
 * First-time TOTP enrolment after login.
 *
 * - `mandatory` (AM): the account has a setup-stage session held in memory by the
 *   auth context. Two-step wizard; on confirm the context seamlessly re-authenticates.
 * - `optional` (non-AM web roles): the user is already fully signed in. Single-pane
 *   suggestion using the real session token, with a 30-day snooze on skip.
 */
export function TwoFactorSetupPage() {
  const navigate = useNavigate();
  const {
    user,
    isAuthenticated,
    pendingTotpSetup,
    setupPendingTotp,
    confirmPendingTotp,
    cancelTotpSetup,
    refreshUser,
  } = useAuth();
  const { setupTotp } = useTotpSetup();
  const { confirmTotp } = useTotpConfirm();

  const mode: Mode | null = pendingTotpSetup
    ? 'mandatory'
    : isAuthenticated && shouldSuggestTotp(user)
      ? 'optional'
      : null;

  const [step, setStep] = useState<'scan' | 'verify'>('scan');
  const [setupData, setSetupData] = useState<TotpSetupData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Once we've launched a success/guard navigation, don't let the guard effect
  // fire a second, competing navigation as `mode` collapses to null.
  const settledRef = useRef(false);
  const finish = useCallback(
    (to: string) => {
      settledRef.current = true;
      navigate(to, { replace: true });
    },
    [navigate],
  );

  // Guard: nothing to enrol here → send the user where they belong.
  useEffect(() => {
    if (mode === null && !settledRef.current) {
      settledRef.current = true;
      navigate(isAuthenticated ? '/' : '/login', { replace: true });
    }
  }, [mode, isAuthenticated, navigate]);

  // Fetch the QR/secret once the mode is known.
  const setupStartedRef = useRef(false);
  const runSetup = useCallback(async () => {
    setIsSettingUp(true);
    setSetupError(null);
    try {
      const data = mode === 'mandatory' ? await setupPendingTotp() : await setupTotp();
      setSetupData(data);
    } catch (err) {
      setSetupError(getErrorMessage(err, 'Could not start two-factor setup. Please try again.'));
    } finally {
      setIsSettingUp(false);
    }
  }, [mode, setupPendingTotp, setupTotp]);

  useEffect(() => {
    if (mode === null || setupStartedRef.current) return;
    setupStartedRef.current = true;
    void runSetup();
  }, [mode, runSetup]);

  // Render the QR image whenever the otpauth URI changes.
  useEffect(() => {
    if (!setupData?.totpUri) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(setupData.totpUri, { width: 200, margin: 2 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [setupData?.totpUri]);

  const handleConfirm = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setFormError(null);
      if (code.length !== 6) {
        setCodeError('Enter the 6-digit code from your authenticator app.');
        return;
      }
      setIsConfirming(true);
      try {
        if (mode === 'mandatory') {
          await confirmPendingTotp(code);
        } else {
          const result = await confirmTotp(code);
          if (!result.success) {
            setFormError(result.error ?? 'Invalid code. Please try again.');
            return;
          }
          await refreshUser();
        }
        finish(consumePostLoginRedirect() ?? '/');
      } catch (err) {
        const message =
          err instanceof ApiError && err.code === 'AUTH_TOTP_INVALID'
            ? 'That code has expired. Enter the current 6-digit code and try again.'
            : getErrorMessage(err, 'Could not verify the code. Please try again.');
        setFormError(message);
      } finally {
        setIsConfirming(false);
      }
    },
    [code, mode, confirmPendingTotp, confirmTotp, refreshUser, finish],
  );

  const handleSkip = useCallback(() => {
    if (user) snoozeTotpSuggestion(user.id);
    finish(consumePostLoginRedirect() ?? '/');
  }, [user, finish]);

  const handleSignOut = useCallback(() => {
    cancelTotpSetup();
    settledRef.current = true;
    navigate('/login', { replace: true });
  }, [cancelTotpSetup, navigate]);

  if (mode === null) return null;

  const title =
    mode === 'mandatory' ? 'Set up two-factor authentication' : 'Secure your account';
  const subtitle =
    mode === 'mandatory'
      ? 'Your admin account requires 2FA before you can continue.'
      : 'Optional — add 2FA now, or set it up later in Settings.';

  const codeField = (
    <AuthField
      id="totp-setup-code"
      label="Authentication Code"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="one-time-code"
      value={code}
      onChange={(e) => {
        setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
        setCodeError('');
      }}
      error={codeError}
      placeholder="000000"
      disabled={isConfirming}
    />
  );

  return (
    <AuthLayout title={title} subtitle={subtitle}>
      {setupError ? (
        <div className="space-y-4">
          <AuthAlert>{setupError}</AuthAlert>
          <button
            type="button"
            onClick={() => void runSetup()}
            className="rounded text-sm font-bold text-primary transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Try again
          </button>
        </div>
      ) : isSettingUp ? (
        <div className="flex items-center gap-3 text-text-secondary" role="status">
          <i className="mdi mdi-loading mdi-spin text-2xl text-primary" aria-hidden="true" />
          <span>Preparing your setup…</span>
        </div>
      ) : mode === 'mandatory' ? (
        <div className="space-y-6">
          <ProgressDots step={step} />
          {step === 'scan' ? (
            <div className="space-y-5">
              {setupData && <TotpQr qrDataUrl={qrDataUrl} />}
              {setupData && <TotpSecret secret={setupData.secret} />}
              <div className="flex items-center justify-between gap-4 pt-2">
                <button type="button" onClick={handleSignOut} className="text-sm font-bold text-text-muted transition hover:text-text-secondary">
                  Sign out
                </button>
                <AuthSubmitButtonLike onClick={() => setStep('verify')}>
                  I&apos;ve scanned it
                </AuthSubmitButtonLike>
              </div>
            </div>
          ) : (
            <form onSubmit={handleConfirm} noValidate className="space-y-5">
              {formError && <AuthAlert>{formError}</AuthAlert>}
              <p className="text-sm text-text-secondary">
                Enter the 6-digit code your authenticator app is showing.
              </p>
              {codeField}
              <div className="flex items-center justify-between gap-4 pt-2">
                <button type="button" onClick={() => setStep('scan')} className="text-sm font-bold text-primary transition hover:underline">
                  Back
                </button>
                <AuthSubmitButton loading={isConfirming}>Verify &amp; continue</AuthSubmitButton>
              </div>
            </form>
          )}
        </div>
      ) : (
        <form onSubmit={handleConfirm} noValidate className="space-y-5">
          {formError && <AuthAlert>{formError}</AuthAlert>}
          {setupData && <TotpQr qrDataUrl={qrDataUrl} />}
          {setupData && <TotpSecret secret={setupData.secret} />}
          {codeField}
          <div className="flex items-center justify-between gap-4 pt-2">
            <button type="button" onClick={handleSkip} disabled={isConfirming} className="text-sm font-bold text-text-muted transition hover:text-text-secondary disabled:opacity-50">
              Skip for now
            </button>
            <AuthSubmitButton loading={isConfirming}>Enable 2FA</AuthSubmitButton>
          </div>
          <p className="pt-1 text-center">
            <AuthTextLink to="/settings/security">Manage this later in Settings</AuthTextLink>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}

/** A non-submit button styled like the coral CTA, for the wizard's step advance. */
function AuthSubmitButtonLike({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center justify-center gap-2 rounded bg-real-estate px-7 text-sm font-bold text-white transition hover:brightness-95 active:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {children}
    </button>
  );
}
