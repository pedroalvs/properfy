import type { AppointmentRestrictionDetail } from '../types';

interface RestrictionsSectionProps {
  restrictions: AppointmentRestrictionDetail[];
  /** Legacy flattened notes string — fallback when no structured data exists. */
  summary: string | null;
}

/** Scheduling restrictions the inspector must respect on site. */
export function RestrictionsSection({ restrictions, summary }: RestrictionsSectionProps) {
  const hasStructured = restrictions.length > 0;
  if (!hasStructured && !summary) return null;

  return (
    <section
      className="rounded-[20px] border border-black/[0.06] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
      data-testid="restrictions-section"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Restrictions</p>
      {hasStructured ? (
        <div className="mt-2 flex flex-col gap-3">
          {restrictions.map((restriction, index) => (
            <div key={index} className={index > 0 ? 'border-t border-black/[0.06] pt-3' : ''}>
              {restriction.isHome && (
                <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <i className="mdi mdi-home-account text-base text-primary" aria-hidden="true" />
                  Tenant will be home
                </p>
              )}
              {restriction.unavailableDays.length > 0 && (
                <p className="mt-1 text-sm text-text-primary">
                  <span className="font-semibold">Unavailable days:</span>{' '}
                  {restriction.unavailableDays.join(', ')}
                </p>
              )}
              {restriction.unavailableHours.length > 0 && (
                <p className="mt-1 text-sm text-text-primary">
                  <span className="font-semibold">Unavailable hours:</span>{' '}
                  {restriction.unavailableHours.join(', ')}
                </p>
              )}
              {restriction.notes && (
                <p className="mt-1 text-sm text-text-primary">{restriction.notes}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-text-primary">{summary}</p>
      )}
    </section>
  );
}
