import type { InspectorAvailabilityResponse } from '@properfy/shared';
import { AvailabilityCell } from './AvailabilityCell';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

interface AvailabilityGridProps {
  availability: InspectorAvailabilityResponse | undefined;
}

export function AvailabilityGrid({ availability }: AvailabilityGridProps) {
  if (!availability) {
    return (
      <div data-testid="availability-grid-loading" className="grid grid-cols-7 gap-1 animate-pulse">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div data-testid="availability-grid" className="space-y-1">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500">
        {DAYS.map(({ label }) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DAYS.map(({ key }) => (
          <AvailabilityCell
            key={`${key}-am`}
            label="AM"
            active={availability.template[key].am}
            override={availability.overrides[key].am}
          />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DAYS.map(({ key }) => (
          <AvailabilityCell
            key={`${key}-pm`}
            label="PM"
            active={availability.template[key].pm}
            override={availability.overrides[key].pm}
          />
        ))}
      </div>
    </div>
  );
}
