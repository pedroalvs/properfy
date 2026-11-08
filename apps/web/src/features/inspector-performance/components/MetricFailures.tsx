import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCivilDate, RELIABILITY_FAILURES_MAX, type ReliabilityMetricFailure } from '@properfy/shared';

export interface MetricFailuresProps {
  failures: ReliabilityMetricFailure[];
  failureCount: number;
}

/**
 * The expandable per-metric failure list (L-F07-06). Up to 20 failures are
 * returned; `failureCount` carries the true total. Each row links to the
 * appointment (same tab). No button when there are no failures.
 */
export function MetricFailures({ failures, failureCount }: MetricFailuresProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (failureCount === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className="text-xs font-medium text-primary hover:underline"
        onClick={() => setOpen((prev) => !prev)}
      >
        {`Show ${failureCount} ${failureCount === 1 ? 'issue' : 'issues'}`}
      </button>
      {open && (
        <ul id={panelId} className="mt-2 flex flex-col gap-1">
          {failures.map((failure, index) => (
            <li key={`${failure.appointmentId}-${index}`} className="text-xs text-text-secondary">
              <span>{`${formatCivilDate(failure.serviceDate)} · ${failure.detail}`}</span>{' '}
              <Link to={`/appointments/${failure.appointmentId}`} className="text-primary hover:underline">
                Open appointment
              </Link>
            </li>
          ))}
          {failureCount > RELIABILITY_FAILURES_MAX && (
            <li className="text-xs text-text-muted">{`Showing the ${RELIABILITY_FAILURES_MAX} most recent of ${failureCount}`}</li>
          )}
        </ul>
      )}
    </div>
  );
}
