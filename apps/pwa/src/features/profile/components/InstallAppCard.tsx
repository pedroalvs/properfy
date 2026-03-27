import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useInstallPrompt } from '@/app/useInstallPrompt';

export function InstallAppCard() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [isInstalling, setIsInstalling] = useState(false);

  if (!canInstall) return null;

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm" data-testid="install-app-card">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-real-estate/10 text-real-estate">
          <i className="mdi mdi-monitor-arrow-down text-xl" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-text-primary">Install Properfy</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Install the inspector app on this computer for faster access and a standalone window.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <Button
          variant="primary"
          className="w-full"
          loading={isInstalling}
          onClick={async () => {
            setIsInstalling(true);
            try {
              await promptInstall();
            } finally {
              setIsInstalling(false);
            }
          }}
        >
          Install App
        </Button>
      </div>
    </div>
  );
}
