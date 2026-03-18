import { PriorityMode } from '@properfy/shared';
import { PRIORITY_MODE_MAP } from '@/lib/status-colors';

interface PriorityModeSelectProps {
  value: string;
  onChange: (value: string) => void;
}

const OPTIONS = [
  { value: PriorityMode.STANDARD, label: PRIORITY_MODE_MAP[PriorityMode.STANDARD].label },
  { value: PriorityMode.PRIORITY_24H, label: PRIORITY_MODE_MAP[PriorityMode.PRIORITY_24H].label },
];

export function PriorityModeSelect({ value, onChange }: PriorityModeSelectProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-text-secondary">Priority Mode</legend>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-3 rounded border border-border-subtle px-4 py-3 transition-colors hover:bg-black/[0.02]"
            data-selected={value === option.value}
          >
            <input
              type="radio"
              name="priorityMode"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm font-medium text-text-primary">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
