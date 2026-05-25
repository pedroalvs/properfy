import { useState } from 'react';
import { useInstallPrompt } from '@/app/useInstallPrompt';
import { isIosBannerDismissed, dismissIosBanner } from '../lib/install-banner-storage';

export function InstallBannerIos() {
  const { isIosSafariEligible } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(isIosBannerDismissed);

  if (!isIosSafariEligible || dismissed) return null;

  const handleDismiss = () => {
    dismissIosBanner();
    setDismissed(true);
  };

  return (
    <div
      data-testid="install-banner-ios"
      className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3"
    >
      <div className="min-w-0 flex items-start gap-2">
        <i className="mdi mdi-arrow-down-circle-outline shrink-0 text-xl text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-text-primary">Add to Home Screen</p>
          <p className="text-xs text-text-muted">
            Tap the Share icon, then choose <strong>Add to Home Screen</strong>.
          </p>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss iOS install banner"
        className="shrink-0 rounded-lg p-1 text-text-muted hover:text-text-secondary"
      >
        <i className="mdi mdi-close text-base" aria-hidden="true" />
      </button>
    </div>
  );
}
