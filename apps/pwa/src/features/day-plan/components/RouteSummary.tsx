import { formatInstantTime, type DayPlanResponse } from '@properfy/shared';
import { Alert } from '@/components/ui/Alert';
import { formatDriveDuration, formatDistance } from '../lib/format-route';

interface RouteSummaryProps {
  plan: DayPlanResponse;
}

/** Totals line for the Route screen: driving, finish, waiting and distance, plus a window-violation alert. */
export function RouteSummary({ plan }: RouteSummaryProps) {
  const { totals } = plan;
  const driving = formatDriveDuration(totals.driveS);
  const finish = plan.finishEta ? formatInstantTime(plan.finishEta, plan.timezone) : '';
  const waiting = totals.waitS > 0 ? formatDriveDuration(totals.waitS) : '';
  const distance = formatDistance(totals.distanceM);
  const lateCount = plan.violations.length;

  const primary = [driving && `${driving} driving`, finish && `Finish ${finish}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-1">
      {primary && <p className="text-sm font-semibold text-foreground">{primary}</p>}
      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {waiting && <span>{waiting} waiting</span>}
        {distance && <span>{distance}</span>}
      </div>
      {lateCount > 0 && (
        <Alert tone="warning" className="mt-1">
          {lateCount} {lateCount === 1 ? 'stop' : 'stops'} would arrive after their window
        </Alert>
      )}
    </div>
  );
}
