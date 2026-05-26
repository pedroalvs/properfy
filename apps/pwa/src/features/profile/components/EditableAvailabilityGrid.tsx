import { useState, useCallback } from 'react';
import type { InspectorAvailabilityResponse, AvailabilityTemplate } from '@properfy/shared';
import { AvailabilityCell } from './AvailabilityCell';
import { useUpdateInspectorAvailabilityTemplate } from '../hooks/useUpdateInspectorAvailabilityTemplate';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type SlotKey = 'am' | 'pm';

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

interface EditableAvailabilityGridProps {
  availability: InspectorAvailabilityResponse;
}

export function EditableAvailabilityGrid({ availability }: EditableAvailabilityGridProps) {
  const [localTemplate, setLocalTemplate] = useState<AvailabilityTemplate>(availability.template);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { mutateAsync, isPending } = useUpdateInspectorAvailabilityTemplate();

  const toggle = useCallback((day: DayKey, slot: SlotKey) => {
    setLocalTemplate((prev) => ({
      ...prev,
      [day]: { ...prev[day], [slot]: !prev[day][slot] },
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setErrorMsg(null);
    try {
      await mutateAsync(localTemplate);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save');
    }
  }, [mutateAsync, localTemplate]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500">
        {DAYS.map(({ label }) => <div key={label}>{label}</div>)}
      </div>

      {(['am', 'pm'] as SlotKey[]).map((slot) => (
        <div key={slot} className="grid grid-cols-7 gap-1">
          {DAYS.map(({ key }) => (
            <AvailabilityCell
              key={`${key}-${slot}`}
              label={slot.toUpperCase()}
              active={localTemplate[key][slot]}
              override={availability.overrides[key][slot]}
              onToggle={() => toggle(key, slot)}
            />
          ))}
        </div>
      ))}

      {errorMsg && (
        <p role="alert" className="text-xs text-red-600">{errorMsg}</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="w-full rounded-2xl bg-real-estate py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
