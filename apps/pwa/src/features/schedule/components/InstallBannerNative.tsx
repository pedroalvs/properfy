import { useState } from 'react';
import { useInstallPrompt } from '@/app/useInstallPrompt';
import { isNativeBannerDismissed, dismissNativeBanner } from '../lib/install-banner-storage';

export function InstallBannerNative() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(isNativeBannerDismissed);

  if (!canInstall || dismissed) return null;

  const handleInstall = async () => {
    await promptInstall();
    setDismissed(true);
  };

  const handleDismiss = () => {
    dismissNativeBanner();
    setDismissed(true);
  };

  return (
    <div
      data-testid="install-banner-native"
      className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary">Install Properfy</p>
        <p className="text-xs text-text-muted">Add to your home screen for faster access.</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={handleInstall}
          className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install banner"
          className="rounded-lg p-1 text-text-muted hover:text-text-secondary"
        >
          <i className="mdi mdi-close text-base" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
