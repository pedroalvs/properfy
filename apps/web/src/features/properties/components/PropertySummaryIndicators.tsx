import type { PropertySummaryResponse } from '@properfy/shared';
import { StatCard, type StatCardVariant } from '@/features/dashboard/components/StatCard';

interface PropertySummaryIndicatorsProps {
  summary: PropertySummaryResponse | null;
  isLoading: boolean;
  isError: boolean;
}

const CARDS: ReadonlyArray<{
  key: string;
  label: string;
  icon: string;
  variant: StatCardVariant;
  value: (s: PropertySummaryResponse) => number;
}> = [
  {
    key: 'total',
    label: 'Total Properties',
    icon: 'mdi-home-city-outline',
    variant: 'secondary',
    value: (s) => s.totalCount,
  },
  {
    key: 'house',
    label: 'Houses',
    icon: 'mdi-home-outline',
    variant: 'primary',
    value: (s) => s.houseCount,
  },
  {
    key: 'apartment',
    label: 'Apartments',
    icon: 'mdi-office-building-outline',
    variant: 'accent',
    value: (s) => s.apartmentCount,
  },
];

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
        role="status"
        aria-live="polite"
        aria-label="Loading property summary"
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
          variant={card.variant}
        />
      ))}
    </div>
  );
}
