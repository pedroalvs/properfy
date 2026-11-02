import { formatInstantTime, type DayPlanResponse } from '@properfy/shared';
import { Alert } from '@/components/ui/Alert';
import { formatDriveDuration, formatDistance } from '../lib/format-route';
import { formatDelta, formatDrivingTotal, formatLocalEta, toViolationMessages } from '../lib/reorder-draft';
import type { ReorderDraft } from '../hooks/useReorderDraft';

interface RouteSummaryProps {
  plan: DayPlanResponse;
  /** When present, the local draft drives the finish/delta/violations (reorder in progress or a saved manual order). */
  draft?: ReorderDraft;
  /** "Reset to suggested order" handler; the link shows only when it is provided. */
  onReset?: () => void;
}

/** Totals for the Route screen: driving, finish, waiting, distance, window violations and the reorder delta. */
export function RouteSummary({ plan, draft, onReset }: RouteSummaryProps) {
  const { totals } = plan;
  const evaluation = draft?.evaluation ?? null;
  // Show the local line whenever there is a draft evaluation and the order is
  // manual (either an unsaved draft or a saved manual order), so the inspector
  // always sees the cost of the chosen order.
  const showLocal = !!evaluation && (draft!.isDirty || plan.manualOrder);
  const showResetLink = !!onReset && (!!draft?.isDirty || plan.manualOrder);

  const localMessages = evaluation ? toViolationMessages(plan, draft!.displayOrder, evaluation.violations) : [];
  const serverLateCount = plan.violations.length;

  const primary = showLocal
    ? [
        evaluation!.finishS !== null && `Finish ${formatLocalEta(evaluation!.finishS, plan.timezone)}`,
        formatDelta(evaluation!.deltaFinishMin),
        formatDrivingTotal(evaluation!.totalTravelS),
      ]
        .filter(Boolean)
        .join(' · ')
    : [
        totals.driveS ? `${formatDriveDuration(totals.driveS)} driving` : '',
        plan.finishEta ? `Finish ${formatInstantTime(plan.finishEta, plan.timezone)}` : '',
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <div className="flex flex-col gap-1">
      {primary && <p className="text-sm font-semibold text-foreground">{primary}</p>}
      {!showLocal && (
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {totals.waitS > 0 && <span>{formatDriveDuration(totals.waitS)} waiting</span>}
          {formatDistance(totals.distanceM) && <span>{formatDistance(totals.distanceM)}</span>}
        </div>
      )}

      {showResetLink && (
        <button
          type="button"
          onClick={onReset}
          className="self-start text-xs font-semibold text-primary active:underline"
        >
          Reset to suggested order
        </button>
      )}

      {/* Window violations never block Save (DB3) — they only warn. */}
      {showLocal && localMessages.length > 0 && (
        <Alert tone="warning" role="status" className="mt-1 flex-col items-start gap-1">
          {localMessages.map((m) => (
            <span key={m.key}>{m.message}</span>
          ))}
        </Alert>
      )}
      {!showLocal && serverLateCount > 0 && (
        <Alert tone="warning" className="mt-1">
          {serverLateCount} {serverLateCount === 1 ? 'stop' : 'stops'} would arrive after their window
        </Alert>
      )}
    </div>
  );
}
