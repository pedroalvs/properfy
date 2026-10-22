import { Home } from 'lucide-react';
import type { AppointmentRestrictionDetail } from '../types';
import { formatWallTimeWindow } from '@/lib/format-date';
import { Card } from '@/components/ui/Card';

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
    <Card data-testid="restrictions-section">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Restrictions</p>
      {hasStructured ? (
        <div className="mt-2 flex flex-col gap-3">
          {restrictions.map((restriction, index) => (
            <div key={index} className={index > 0 ? 'border-t border-border pt-3' : ''}>
              {restriction.isHome && (
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Home className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  Tenant will be home
                </p>
              )}
              {restriction.unavailableDays.length > 0 && (
                <p className="mt-1 text-sm text-foreground">
                  <span className="font-semibold">Unavailable days:</span>{' '}
                  {restriction.unavailableDays.join(', ')}
                </p>
              )}
              {restriction.unavailableHours.length > 0 && (
                <p className="mt-1 text-sm text-foreground">
                  <span className="font-semibold">Unavailable hours:</span>{' '}
                  {restriction.unavailableHours.map(formatWallTimeWindow).join(', ')}
                </p>
              )}
              {restriction.notes && (
                <p className="mt-1 text-sm text-foreground">{restriction.notes}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-foreground">{summary}</p>
      )}
    </Card>
  );
}
