import type { AvailableSlot, DayOfWeek } from '@properfy/shared';

const DAYS: { label: string; value: DayOfWeek }[] = [
  { label: 'Mon', value: 'MON' },
  { label: 'Tue', value: 'TUE' },
  { label: 'Wed', value: 'WED' },
  { label: 'Thu', value: 'THU' },
  { label: 'Fri', value: 'FRI' },
  { label: 'Sat', value: 'SAT' },
  { label: 'Sun', value: 'SUN' },
];

// 30-minute increments from 00:00 to 23:30
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

interface WeeklyAvailabilityPickerProps {
  value: AvailableSlot[];
  onChange: (slots: AvailableSlot[]) => void;
  disabled?: boolean;
}

export function WeeklyAvailabilityPicker({ value, onChange, disabled }: WeeklyAvailabilityPickerProps) {
  const activeByDay = new Map(value.map((s) => [s.dayOfWeek, s]));

  function toggleDay(day: DayOfWeek) {
    if (activeByDay.has(day)) {
      onChange(value.filter((s) => s.dayOfWeek !== day));
    } else {
      const newSlots = [...value, { dayOfWeek: day, start: '09:00', end: '17:00' }];
      const order = DAYS.map((d) => d.value);
      onChange(newSlots.sort((a, b) => order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek)));
    }
  }

  function updateSlot(day: DayOfWeek, field: 'start' | 'end', time: string) {
    onChange(value.map((s) => (s.dayOfWeek === day ? { ...s, [field]: time } : s)));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {DAYS.map(({ label, value: day }) => {
          const isActive = activeByDay.has(day);
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => toggleDay(day)}
              className={[
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-text-secondary hover:bg-gray-200',
                disabled ? 'cursor-not-allowed opacity-50' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      {value.map((slot) => (
        <div key={slot.dayOfWeek} className="flex items-center gap-2 rounded border border-black/10 bg-white px-3 py-2">
          <span className="w-8 text-sm font-semibold text-text-primary">
            {DAYS.find((d) => d.value === slot.dayOfWeek)?.label}
          </span>
          <select
            data-testid={`start-${slot.dayOfWeek}`}
            value={slot.start}
            disabled={disabled}
            onChange={(e) => updateSlot(slot.dayOfWeek, 'start', e.target.value)}
            className="rounded border border-black/10 px-2 py-1 text-sm"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="text-xs text-text-muted">to</span>
          <select
            data-testid={`end-${slot.dayOfWeek}`}
            value={slot.end}
            disabled={disabled}
            onChange={(e) => updateSlot(slot.dayOfWeek, 'end', e.target.value)}
            className="rounded border border-black/10 px-2 py-1 text-sm"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
