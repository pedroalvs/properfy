import { useState } from 'react';
import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useInstallPrompt } from '@/app/useInstallPrompt';

export function InstallAppCard() {
  const { isInstalled, canInstall, manualInstructions, promptInstall } = useInstallPrompt();
  const [isInstalling, setIsInstalling] = useState(false);

  if (isInstalled) return null;

  return (
    <div className="rounded-lg bg-card p-4 shadow-sm" data-testid="install-app-card">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">Install Properfy</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Install the inspector app on your phone for faster access and a full-screen, standalone app.
          </p>
          {!canInstall && manualInstructions && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {manualInstructions}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4">
        {canInstall ? (
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
        ) : (
          <div className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            Installation is available from a supported browser menu even when the automatic prompt is not exposed here.
          </div>
        )}
      </div>
    </div>
  );
}
