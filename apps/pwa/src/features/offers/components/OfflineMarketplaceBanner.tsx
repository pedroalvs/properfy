import { useIsOnline } from '@/hooks/useIsOnline';

export function OfflineMarketplaceBanner() {
  const isOnline = useIsOnline();

  if (isOnline) return null;

  return (
    <div
      className="flex flex-col items-center justify-center px-page-x py-16 text-center"
      data-testid="offline-marketplace-banner"
    >
      <i className="mdi mdi-wifi-off text-[48px] text-text-muted" aria-hidden="true" />
      <p className="mt-4 text-base font-semibold text-text-primary">Offline marketplace mode</p>
      <p className="mt-1 text-sm text-text-secondary">
        Cached offers may still be visible, but you need an internet connection to accept new work.
      </p>
    </div>
  );
}
