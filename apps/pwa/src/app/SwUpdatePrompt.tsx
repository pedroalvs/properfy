import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
}

export function SwUpdatePrompt() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      window.location.reload();
    };

    const checkForUpdates = async () => {
      const reg = await navigator.serviceWorker.ready;
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setShowUpdate(true);
            setRegistration(reg);
          }
        });
      });
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    checkForUpdates();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const handleUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  if (!showUpdate) return null;

  return (
    <div
      className="fixed left-4 right-4 top-4 z-[200] flex items-center gap-3 rounded-lg bg-secondary p-4 shadow-lg"
      role="alert"
      data-testid="sw-update-prompt"
    >
      <i className="mdi mdi-cellphone-arrow-down text-xl text-white" aria-hidden="true" />
      <span className="flex-1 text-sm font-medium text-white">
        New version available
      </span>
      <Button variant="outlined" onClick={handleUpdate} className="!border-white !text-white !min-h-[36px]">
        Update
      </Button>
    </div>
  );
}
