import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SlotFormDrawer } from '@/features/availability-slots/components/SlotFormDrawer';
import { nextOccurrence } from '@/lib/next-day-of-week';
import { useInspectorAvailabilityTemplateById } from '../hooks/useInspectorAvailabilityTemplateById';

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

const CELL_CLASSES: Record<string, string> = {
  'on': 'bg-real-estate text-white',
  'off': 'bg-gray-100 text-gray-400',
  'on-override': 'bg-real-estate/20 text-real-estate border border-real-estate/40',
  'off-override': 'bg-amber-100 text-amber-700 border border-amber-300',
};

function cellState(active: boolean, override: boolean) {
  return active ? (override ? 'on-override' : 'on') : (override ? 'off-override' : 'off');
}

interface InspectorAvailabilityTabProps {
  inspectorId: string;
}

export function InspectorAvailabilityTab({ inspectorId }: InspectorAvailabilityTabProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useInspectorAvailabilityTemplateById(inspectorId);
  const [slotDrawerDay, setSlotDrawerDay] = useState<DayKey | null>(null);

  const openOverride = (day: DayKey) => setSlotDrawerDay(day);
  const closeOverride = () => setSlotDrawerDay(null);

  const handleSaved = () => {
    closeOverride();
    queryClient.invalidateQueries({ queryKey: ['inspector-availability-template', inspectorId] });
  };

  if (isLoading) {
    return (
      <div data-testid="availability-tab-loading" className="grid grid-cols-7 gap-1 animate-pulse">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-gray-200" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500">
        {DAYS.map(({ label }) => <div key={label}>{label}</div>)}
      </div>

      {(['am', 'pm'] as const).map((slot) => (
        <div key={slot} className="grid grid-cols-7 gap-1">
          {DAYS.map(({ key }) => {
            const state = cellState(data.template[key][slot], data.overrides[key][slot]);
            return (
              <div
                key={`${key}-${slot}`}
                className={`flex items-center justify-center rounded py-1 text-xs font-medium ${CELL_CLASSES[state]}`}
              >
                {slot.toUpperCase()}
              </div>
            );
          })}
        </div>
      ))}

      <div className="grid grid-cols-7 gap-1 pt-1">
        {DAYS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-label={`Override ${label}`}
            onClick={() => openOverride(key)}
            className="rounded bg-gray-50 px-1 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-100"
          >
            Override
          </button>
        ))}
      </div>

      <SlotFormDrawer
        open={slotDrawerDay !== null}
        onClose={closeOverride}
        onSaved={handleSaved}
        defaultValues={slotDrawerDay ? { inspectorId, date: nextOccurrence(slotDrawerDay) } : undefined}
      />
    </div>
  );
}
