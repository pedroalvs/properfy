import type { InspectorWorkloadResponse } from '@properfy/shared';
import { InfoBanner } from '@/components/feedback/InfoBanner';

interface WorkloadAlertBannerProps {
  kpis: InspectorWorkloadResponse['kpis'];
  thresholds: InspectorWorkloadResponse['thresholds'];
}

function plural(count: number): string {
  return count === 1 ? 'inspector is' : 'inspectors are';
}

/**
 * The headline read on the week: is anyone over capacity, and is anyone about to
 * be. Renders an all-clear rather than disappearing when nothing is wrong — an
 * absent banner is ambiguous between "all good" and "not loaded".
 */
export function WorkloadAlertBanner({ kpis, thresholds }: WorkloadAlertBannerProps) {
  const overloaded = kpis.overloaded.count;
  const nearLimit = kpis.nearLimit.count;

  if (overloaded === 0 && nearLimit === 0) {
    return (
      <InfoBanner variant="info">
        Every inspector is under the weekly limit of {thresholds.weeklyBusy} inspections.
      </InfoBanner>
    );
  }

  return (
    <InfoBanner variant={overloaded > 0 ? 'error' : 'warning'}>
      {overloaded > 0 && (
        <strong>
          {overloaded} {plural(overloaded)} at or above the overload threshold (
          {thresholds.weeklyOverloaded}+).
        </strong>
      )}
      {overloaded > 0 && nearLimit > 0 && ' '}
      {nearLimit > 0 && (
        <>
          {nearLimit} {plural(nearLimit)} approaching it ({thresholds.weeklyBusy}+).
        </>
      )}{' '}
      Consider redistributing work before the week starts.
    </InfoBanner>
  );
}
