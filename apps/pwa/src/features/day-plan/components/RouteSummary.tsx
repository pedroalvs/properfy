import { formatInstantTime, type DayPlanResponse } from '@properfy/shared';
import { Alert } from '@/components/ui/Alert';
import { formatDriveDuration, formatDistance } from '../lib/format-route';
import {
  formatDelta,
  formatDrivingTotal,
  formatLocalEta,
  previewUnavailableMessage,
  toViolationMessages,
  type ReorderPreviewView,
} from '../lib/reorder-preview';
import type { ReorderDraft } from '../hooks/useReorderDraft';

interface RouteSummaryProps {
  plan: DayPlanResponse;
  /** The reorder draft; when present, a manual/edited order drives the summary. */
  draft?: ReorderDraft;
  /** Server-computed evaluation of the draft order (F04 Plan B). */
  preview?: ReorderPreviewView;
  /** "Reset to suggested order" handler; the link shows only when it is provided. */
  onReset?: () => void;
}

/** Totals for the Route screen: driving, finish, waiting, distance, window violations and the reorder delta. */
export function RouteSummary({ plan, draft, preview, onReset }: RouteSummaryProps) {
  const { totals } = plan;
  // The manual/edited line applies whenever there is a draft and the order is
  // manual (an unsaved draft or a saved manual order), so the inspector always
  // sees the cost of the chosen order.
  const manualContext = !!draft && (draft.isDirty || plan.manualOrder);
  const showReset = !!onReset && (!!draft?.isDirty || plan.manualOrder);

  const ready = manualContext && preview?.status === 'READY';
  // A dirty draft whose preview has not resolved: the saved plan's finish belongs to a
  // different order than the one on screen, so suppress it rather than show it as final
  // (the "Updating…"/unavailable note carries the state). Non-dirty totals are the saved
  // order's own and stay visible.
  const dirtyPending = !!draft?.isDirty && !ready;
  const localMessages =
    ready && draft ? toViolationMessages(plan, draft.displayOrder, preview!.violations) : [];
  const serverLateCount = plan.violations.length;

  const primary = ready
    ? [
        preview!.finishMs !== null && `Finish ${formatLocalEta(preview!.finishMs, plan.timezone)}`,
        preview!.deltaMin !== null && formatDelta(preview!.deltaMin),
        formatDrivingTotal(preview!.driveS),
      ]
        .filter(Boolean)
        .join(' · ')
    : dirtyPending
      ? ''
      : [
          totals.driveS ? `${formatDriveDuration(totals.driveS)} driving` : '',
          plan.finishEta ? `Finish ${formatInstantTime(plan.finishEta, plan.timezone)}` : '',
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <div className="flex flex-col gap-1">
      {primary && <p className="text-sm font-semibold text-foreground">{primary}</p>}

      {/* The server degraded to the straight-line stub — the numbers are estimates (matches the GET banner). */}
      {ready && preview!.approximate && (
        <p className="text-xs text-muted-foreground" role="status">
          Approximate route: travel times are estimates
        </p>
      )}

      {/* Manual order, preview pending or unavailable: say so, never show stale numbers as final. */}
      {manualContext && preview?.status === 'LOADING' && (
        <p className="text-xs text-muted-foreground" role="status">
          Updating route times…
        </p>
      )}
      {manualContext && preview?.status === 'UNAVAILABLE' && (
        <p className="text-xs text-muted-foreground" role="status">
          {previewUnavailableMessage(preview.reason)}
        </p>
      )}

      {!manualContext && (
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {totals.waitS > 0 && <span>{formatDriveDuration(totals.waitS)} waiting</span>}
          {formatDistance(totals.distanceM) && <span>{formatDistance(totals.distanceM)}</span>}
        </div>
      )}

      {showReset && (
        <button
          type="button"
          onClick={onReset}
          className="self-start text-xs font-semibold text-primary active:underline"
        >
          Reset to suggested order
        </button>
      )}

      {/* Window violations never block Save (DB3) — they only warn. */}
      {ready && localMessages.length > 0 && (
        <Alert tone="warning" role="status" className="mt-1 flex-col items-start gap-1">
          {localMessages.map((m) => (
            <span key={m.appointmentId}>{m.message}</span>
          ))}
        </Alert>
      )}
      {!manualContext && serverLateCount > 0 && (
        <Alert tone="warning" className="mt-1">
          {serverLateCount} {serverLateCount === 1 ? 'stop' : 'stops'} would arrive after their window
        </Alert>
      )}
    </div>
  );
}
