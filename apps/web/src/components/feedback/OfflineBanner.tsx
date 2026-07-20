import { useIsOnline } from '@/hooks/useIsOnline';

/** Slim global banner shown while the browser reports no connectivity. */
export function OfflineBanner() {
  const isOnline = useIsOnline();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 bg-warning px-4 py-2 text-sm font-semibold text-white"
      data-testid="offline-banner"
    >
      <i className="mdi mdi-wifi-off" aria-hidden="true" />
      <span>You are offline. Check your connection and try again.</span>
    </div>
  );
}
