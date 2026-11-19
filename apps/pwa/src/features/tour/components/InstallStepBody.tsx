import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useInstallPrompt } from '@/app/useInstallPrompt';

/**
 * Body of the tour's final install step (shown only outside standalone). Adapts to
 * the platform via the existing `useInstallPrompt` state (read-only — the banners
 * and the App settings install card are unchanged, DB5):
 *  - iOS Safari: Share → Add to Home Screen instructions, no install button.
 *  - Android/Chrome with a prompt: an "Install app" button wired to `promptInstall()`.
 *  - Otherwise: the platform's manual instructions.
 */
export function InstallStepBody() {
  const { isIosSafariEligible, canInstall, manualInstructions, promptInstall } = useInstallPrompt();
  const [installed, setInstalled] = useState(false);

  if (installed) {
    return <p className="text-sm text-muted-foreground">Installed. You're all set.</p>;
  }

  if (isIosSafariEligible) {
    return (
      <p className="text-sm text-muted-foreground">
        Tap <span className="font-semibold text-foreground">Share</span>, then{' '}
        <span className="font-semibold text-foreground">Add to Home Screen</span>. Open Properfy from
        your Home Screen to get notifications.
      </p>
    );
  }

  if (canInstall) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Install the app for quicker access and notifications.
        </p>
        <Button
          variant="primary"
          onClick={async () => {
            const accepted = await promptInstall();
            if (accepted) setInstalled(true);
          }}
        >
          Install app
        </Button>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      {manualInstructions ?? 'Open Properfy in Chrome or Safari to install it.'}
    </p>
  );
}
