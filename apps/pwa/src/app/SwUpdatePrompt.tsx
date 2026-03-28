import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/Button';

export function SwUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

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
      <Button
        variant="outlined"
        onClick={() => updateServiceWorker(true)}
        className="!border-white !text-white !min-h-[36px]"
      >
        Update
      </Button>
    </div>
  );
}
