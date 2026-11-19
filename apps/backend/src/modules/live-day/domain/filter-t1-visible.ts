import { T1VisibilityService } from '../../inspector-execution/domain/t1-visibility.service';
import type { LiveDayStopRow } from './live-day.read-repository';

/**
 * T-1 visibility filter (L-F05-03). The FIRST step of the use case: it reuses the
 * F04 `T1VisibilityService` predicate — the same one `IDayPlanInputReader` uses —
 * so F05 and F04 see exactly the same set of stops. `DONE` is always visible;
 * `SCHEDULED` passes only under the T-1 rule. The returned list is the single
 * source for fingerprint, stops, progress, alerts, last point, roster and the
 * "stop set changed" rule.
 */
const t1 = new T1VisibilityService();

export function filterT1Visible(rows: LiveDayStopRow[], todayCivil: string): LiveDayStopRow[] {
  return rows.filter((row) => {
    if (row.status === 'DONE') return true; // DONE always visible
    return t1.isVisibleForInspector(
      row.flowType,
      row.confirmationStatus,
      row.keyRequired,
      // @db.Date is anchored at UTC midnight; the service reads UTC components.
      new Date(`${row.scheduledDate}T00:00:00Z`),
      todayCivil,
      row.requiresRentalTenantConfirmation,
    );
  });
}
