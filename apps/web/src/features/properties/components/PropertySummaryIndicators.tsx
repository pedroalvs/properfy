import type { PropertySummaryResponse } from '@properfy/shared';
import { StatCard } from '@/features/dashboard/components/StatCard';

interface PropertySummaryIndicatorsProps {
  summary: PropertySummaryResponse | null;
  isLoading: boolean;
  isError: boolean;
}

const CARDS = [
  {
    key: 'total',
    label: 'Total Properties',
    icon: 'mdi-home-city-outline',
    colorClass: 'border-secondary',
    iconColorClass: 'text-secondary',
    value: (s: PropertySummaryResponse) => s.totalCount,
  },
  {
    key: 'house',
    label: 'Houses',
    icon: 'mdi-home-outline',
    colorClass: 'border-primary',
    iconColorClass: 'text-primary',
    value: (s: PropertySummaryResponse) => s.houseCount,
  },
  {
    key: 'apartment',
    label: 'Apartments',
    icon: 'mdi-office-building-outline',
    colorClass: 'border-accent',
    iconColorClass: 'text-accent',
    value: (s: PropertySummaryResponse) => s.apartmentCount,
  },
] as const;

export function PropertySummaryIndicators({
  summary,
  isLoading,
  isError,
}: PropertySummaryIndicatorsProps) {
  // On error, render nothing — the summary must never block the list below.
  if (isError) return null;

  if (isLoading || !summary) {
    return (
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4"
        data-testid="property-summary-loading"
      >
        {CARDS.map((card) => (
          <div
            key={card.key}
            className="rounded bg-card-bg shadow-sm p-4 h-[76px] animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4" data-testid="property-summary">
      {CARDS.map((card) => (
        <StatCard
          key={card.key}
          icon={card.icon}
          value={card.value(summary)}
          label={card.label}
          colorClass={card.colorClass}
          iconColorClass={card.iconColorClass}
        />
      ))}
    </div>
  );
}
