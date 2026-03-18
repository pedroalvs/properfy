import { useIsOnline } from '@/hooks/useIsOnline';

export function ScheduleOfflineBanner() {
  const isOnline = useIsOnline();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="mx-page-x mb-3 flex items-center gap-2 rounded-lg bg-warning/10 px-4 py-2 text-xs font-medium text-warning"
      data-testid="schedule-offline-banner"
    >
      <i className="mdi mdi-cloud-off-outline" aria-hidden="true" />
      Viewing cached schedule
    </div>
  );
}
