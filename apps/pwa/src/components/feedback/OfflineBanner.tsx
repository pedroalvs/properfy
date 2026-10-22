import { WifiOff } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { useIsOnline } from '@/hooks/useIsOnline';

export function OfflineBanner() {
  const isOnline = useIsOnline();

  if (isOnline) return null;

  return (
    <Alert
      tone="warning"
      role="status"
      className="items-center rounded-none border-x-0 border-t-0 py-2 font-semibold"
      data-testid="offline-banner"
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      <span>You are offline</span>
    </Alert>
  );
}
