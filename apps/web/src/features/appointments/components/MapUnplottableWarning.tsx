import { Link } from 'react-router-dom';
import { InfoBanner } from '@/components/feedback/InfoBanner';

/** How many rows to name before collapsing the rest into a "+N more" tail. */
const MAX_LISTED = 5;

export interface UnplottableEntry {
  id: string;
  /** Readable identifier — never a raw UUID. e.g. "Group #25", "VST-001". */
  label: string;
  /** Detail route, opened in the same tab. */
  to: string;
  /** Why this row has no pin, in the operator's terms. */
  reason: string;
}

/**
 * Map rows the API matched but the canvas cannot plot.
 *
 * A group's pin is the centroid of its appointments and the backend drops
 * appointments whose property has no coordinates, so a perfectly valid search
 * hit can have nowhere to go. Silently omitting it made the map look broken —
 * this states the gap and links to where the operator can fix it.
 *
 * Renders nothing when there is nothing to report.
 */
export function MapUnplottableWarning({
  noun,
  entries,
}: {
  noun: 'appointment' | 'group';
  entries: UnplottableEntry[];
}) {
  if (entries.length === 0) return null;

  const plural = entries.length !== 1;
  const hidden = entries.length - MAX_LISTED;

  return (
    <div className="border-b border-border-subtle px-4 py-2">
      <InfoBanner variant="warning">
        <span data-testid="map-unplottable-warning">
          <span className="font-semibold">
            {entries.length} {noun}
            {plural ? 's' : ''} {plural ? 'have' : 'has'} no map location
          </span>
          <ul className="mt-1 space-y-0.5">
            {entries.slice(0, MAX_LISTED).map((entry) => (
              <li key={entry.id}>
                <Link to={entry.to} className="font-semibold underline hover:no-underline">
                  {entry.label}
                </Link>
                <span className="text-text-secondary"> — {entry.reason}</span>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <span className="mt-1 block text-text-secondary">+{hidden} more</span>
          )}
        </span>
      </InfoBanner>
    </div>
  );
}
