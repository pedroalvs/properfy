import { Link } from 'react-router-dom';
import type { DayPlanStop } from '@properfy/shared';
import { StopCard } from '@/features/day-plan/components/StopCard';

interface ComingUpListProps {
  stops: DayPlanStop[];
  /** Total stops in the plan (controls the link wording). */
  total: number;
}

/** "Coming up" — up to three upcoming stops plus a link to the full Route. */
export function ComingUpList({ stops, total }: ComingUpListProps) {
  const linkLabel = total >= 2 ? `View and reorder all ${total} stops` : 'View route';

  return (
    <section aria-labelledby="coming-up-heading">
      {stops.length > 0 && (
        <>
          <h2 id="coming-up-heading" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Coming up
          </h2>
          <ul className="mt-2 flex flex-col gap-2" role="list">
            {stops.map((stop) => (
              <li key={stop.appointmentId}>
                <StopCard variant="row" stop={stop} />
              </li>
            ))}
          </ul>
        </>
      )}
      <Link
        to="/today/route"
        className="mt-3 inline-block text-sm font-semibold text-primary"
        data-testid="view-all-stops"
      >
        {linkLabel}
      </Link>
    </section>
  );
}
